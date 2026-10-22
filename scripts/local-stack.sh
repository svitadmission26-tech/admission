#!/usr/bin/env bash
# Starts a local Supabase compatible stack (Postgres + PostgREST + GoTrue +
# MailHog) with the ERP migrations applied, so the dynamic login modules can be
# developed and tested without touching the hosted Supabase project.
#
# Usage:
#   scripts/local-stack.sh up      start the stack and apply the migrations
#   scripts/local-stack.sh down    stop and remove the stack
#   scripts/local-stack.sh env     print the environment variables for .env.local
#
# The stack listens on:
#   http://127.0.0.1:8000  Supabase style gateway (/rest/v1 -> PostgREST, /auth/v1 -> GoTrue)
#   http://127.0.0.1:8025  MailHog web interface (captured emails)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NETWORK="svit_net"
JWT_SECRET="localtestsecretlocaltestsecretlocaltest12"
DB_PORT="${DB_PORT:-55433}"
PGRST_PORT="${PGRST_PORT:-3000}"
GOTRUE_PORT="${GOTRUE_PORT:-9999}"
MAIL_PORT="${MAIL_PORT:-8025}"
GATEWAY_PORT="${GATEWAY_PORT:-8000}"

mint_key() {
  node -e "
const { createHmac } = require('node:crypto');
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const header = b64({ alg: 'HS256', typ: 'JWT' });
const payload = b64({ role: '$1', iss: 'supabase', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });
const signature = createHmac('sha256', '$JWT_SECRET').update(header + '.' + payload).digest('base64url');
console.log(header + '.' + payload + '.' + signature);
"
}

start_stack() {
  docker network inspect "$NETWORK" >/dev/null 2>&1 || docker network create "$NETWORK"

  if ! docker ps -a --format '{{.Names}}' | grep -qx svit_pg; then
    docker run -d --name svit_pg --network "$NETWORK" -p "$DB_PORT":5432 \
      -e POSTGRES_PASSWORD=postgres -e JWT_SECRET="$JWT_SECRET" \
      supabase/postgres:15.8.1.060
  fi
  docker start svit_pg >/dev/null 2>&1 || true
  echo "waiting for postgres..."
  for _ in $(seq 1 60); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' svit_pg 2>/dev/null)" = "healthy" ] && break
    sleep 2
  done

  # The reserved roles need a password before PostgREST and GoTrue can use them.
  docker exec -e PGPASSWORD=postgres svit_pg psql -U supabase_admin -d postgres -q \
    -c "alter role authenticator with password 'postgres';" \
    -c "alter role supabase_auth_admin with password 'postgres';"

  # Every migration is idempotent, so re-running the stack is safe.
  for file in "$ROOT"/supabase/migrations/*.sql; do
    docker exec -i svit_pg psql -U postgres -d postgres -q -v ON_ERROR_STOP=0 -f - < "$file" >/dev/null 2>&1 || true
  done

  docker rm -f svit_pgrst svit_gotrue svit_mail >/dev/null 2>&1 || true
  docker run -d --name svit_pgrst --network "$NETWORK" --add-host host.docker.internal:host-gateway \
    -p "$PGRST_PORT":3000 \
    -e PGRST_DB_URI="postgres://authenticator:postgres@host.docker.internal:$DB_PORT/postgres" \
    -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
    -e PGRST_JWT_SECRET="$JWT_SECRET" -e PGRST_SERVER_PORT=3000 \
    postgrest/postgrest:v12.2.3 >/dev/null

  docker run -d --name svit_mail --network "$NETWORK" -p "$MAIL_PORT":8025 -p 1025:1025 \
    mailhog/mailhog:latest >/dev/null

  docker run -d --name svit_gotrue --network "$NETWORK" --add-host host.docker.internal:host-gateway \
    -p "$GOTRUE_PORT":9999 \
    -e GOTRUE_API_HOST=0.0.0.0 -e GOTRUE_API_PORT=9999 \
    -e API_EXTERNAL_URL="http://localhost:$GATEWAY_PORT" \
    -e GOTRUE_DB_DRIVER=postgres \
    -e GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:postgres@host.docker.internal:$DB_PORT/postgres" \
    -e GOTRUE_SITE_URL=http://localhost:5173 -e GOTRUE_URI_ALLOW_LIST='*' \
    -e GOTRUE_JWT_SECRET="$JWT_SECRET" -e GOTRUE_JWT_EXP=3600 -e GOTRUE_JWT_AUD=authenticated \
    -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \
    -e GOTRUE_MAILER_AUTOCONFIRM=true \
    -e GOTRUE_SMTP_HOST=host.docker.internal -e GOTRUE_SMTP_PORT=1025 \
    -e GOTRUE_SMTP_ADMIN_EMAIL=admin@svit.test -e GOTRUE_SMTP_SENDER_NAME=SVIT \
    -e GOTRUE_DISABLE_SIGNUP=false -e GOTRUE_LOG_LEVEL=warn \
    supabase/gotrue:v2.177.0 >/dev/null

  cat > /tmp/svit-gateway.mjs <<'EOF'
// Minimal Supabase style gateway: /auth/v1 -> GoTrue, /rest/v1 -> PostgREST
import http from 'node:http';

const routes = [
	{ prefix: '/auth/v1', target: 'http://127.0.0.1:9999' },
	{ prefix: '/rest/v1', target: 'http://127.0.0.1:3000' },
];

const server = http.createServer((req, res) => {
	const route = routes.find((item) => req.url.startsWith(item.prefix));
	if (!route) {
		res.writeHead(404, { 'content-type': 'application/json' });
		res.end(JSON.stringify({ message: 'not found' }));
		return;
	}
	const path = req.url.slice(route.prefix.length) || '/';
	const chunks = [];
	req.on('data', (chunk) => chunks.push(chunk));
	req.on('end', () => {
		const proxy = http.request(`${route.target}${path}`, {
			method: req.method,
			headers: {
				...req.headers,
				host: new URL(route.target).host,
				'content-length': Buffer.concat(chunks).length,
			},
		}, (upstream) => {
			res.writeHead(upstream.statusCode ?? 500, upstream.headers);
			upstream.pipe(res);
		});
		proxy.on('error', (error) => {
			res.writeHead(502, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ message: error.message }));
		});
		if (chunks.length) proxy.write(Buffer.concat(chunks));
		proxy.end();
	});
});

server.listen(8000, '127.0.0.1', () => console.log('gateway on 127.0.0.1:8000'));
EOF

  if ! pgrep -f "svit-gateway.mjs" >/dev/null 2>&1; then
    nohup node /tmp/svit-gateway.mjs >/tmp/svit-gateway.log 2>&1 &
  fi

  echo "stack is up: http://127.0.0.1:$GATEWAY_PORT"
  "$0" env
}

print_env() {
  cat <<EOF
# Put these in .env.local to run the app against the local stack
VITE_SUPABASE_URL=http://127.0.0.1:$GATEWAY_PORT
VITE_SUPABASE_PUBLISHABLE_KEY=$(mint_key anon)
EOF
}

case "${1:-up}" in
  up) start_stack ;;
  down)
    docker rm -f svit_pgrst svit_gotrue svit_mail svit_pg >/dev/null 2>&1 || true
    pkill -f "svit-gateway.mjs" >/dev/null 2>&1 || true
    echo "stack stopped"
    ;;
  env) print_env ;;
  *) echo "usage: $0 [up|down|env]" >&2; exit 1 ;;
esac
