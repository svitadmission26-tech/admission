#!/usr/bin/env bash
# Starts a local Supabase-compatible stack for the admission app (SvelteKit) and
# applies the bundled schema + demo seed data, so the app can run without a hosted
# Supabase project.
#
# Usage:
#   bash scripts/local-stack.sh up     start (or resume) the stack
#   bash scripts/local-stack.sh down   stop the local stack containers
#   bash scripts/local-stack.sh env    print the values to put in .env
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NETWORK="svit_net"
JWT_SECRET="localtestsecretlocaltestsecretlocaltest12"
DB_PORT="${DB_PORT:-55433}"
PGRST_PORT="${PGRST_PORT:-3900}"
GOTRUE_PORT="${GOTRUE_PORT:-9990}"
GATEWAY_PORT="${GATEWAY_PORT:-8020}"
DB_NAME="admission_v1"

mint_key() {
  node -e "
const { createHmac } = require('node:crypto');
const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const h = b64({ alg: 'HS256', typ: 'JWT' });
const p = b64({ role: '$1', iss: 'supabase', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + 315360000 });
const s = createHmac('sha256', '$JWT_SECRET').update(h + '.' + p).digest('base64url');
console.log(h + '.' + p + '.' + s);
"
}

start_stack() {
  docker network inspect "$NETWORK" >/dev/null 2>&1 || docker network create "$NETWORK"

  if ! docker ps -a --format '{{.Names}}' | grep -qx svit_pg; then
    docker run -d --name svit_pg --network "$NETWORK" -p "$DB_PORT":5432 \
      -e POSTGRES_PASSWORD=postgres -e JWT_SECRET="$JWT_SECRET" \
      supabase/postgres:15.8.1.060 >/dev/null
  fi
  docker start svit_pg >/dev/null 2>&1 || true
  echo "waiting for postgres..."
  for _ in $(seq 1 60); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' svit_pg 2>/dev/null)" = "healthy" ] && break
    sleep 2
  done

  docker exec -e PGPASSWORD=postgres svit_pg psql -U supabase_admin -d postgres -q \
    -c "alter role authenticator with password 'postgres';" \
    -c "alter role supabase_auth_admin with password 'postgres';" >/dev/null 2>&1 || true

  if ! docker exec -e PGPASSWORD=postgres svit_pg psql -U supabase_admin -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null | grep -q 1; then
    docker exec -e PGPASSWORD=postgres svit_pg psql -U supabase_admin -d postgres -c "CREATE DATABASE $DB_NAME;" >/dev/null
  fi

  docker exec -e PGPASSWORD=postgres svit_pg psql -U supabase_admin -d "$DB_NAME" -q \
    -c "CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;" \
    -c "GRANT ALL ON SCHEMA auth TO supabase_auth_admin;" \
    -c "GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;" >/dev/null 2>&1 || true

  docker rm -f admv1_gotrue admv1_pgrst >/dev/null 2>&1 || true
  docker run -d --name admv1_gotrue --network "$NETWORK" --add-host host.docker.internal:host-gateway \
    -p "$GOTRUE_PORT":9999 \
    -e GOTRUE_API_HOST=0.0.0.0 -e GOTRUE_API_PORT=9999 \
    -e API_EXTERNAL_URL="http://localhost:$GATEWAY_PORT" \
    -e GOTRUE_DB_DRIVER=postgres \
    -e GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:postgres@host.docker.internal:$DB_PORT/$DB_NAME" \
    -e GOTRUE_SITE_URL=http://localhost:4040 -e GOTRUE_URI_ALLOW_LIST='*' \
    -e GOTRUE_JWT_SECRET="$JWT_SECRET" -e GOTRUE_JWT_EXP=3600 -e GOTRUE_JWT_AUD=authenticated \
    -e GOTRUE_MAILER_AUTOCONFIRM=true -e GOTRUE_DISABLE_SIGNUP=false -e GOTRUE_LOG_LEVEL=warn \
    supabase/gotrue:v2.177.0 >/dev/null
  sleep 10

  # Apply schema only if the `users` table is missing.
  if ! docker exec -e PGPASSWORD=postgres svit_pg psql -U supabase_admin -d "$DB_NAME" -tAc "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='users'" 2>/dev/null | grep -q 1; then
    sed -E 's/^AS \$[[:space:]]*$/AS $$/; s/^\$;[[:space:]]*$/$$;/; /storage\.buckets/d' "$ROOT/supabase/setup_complete_db.sql" | \
      docker exec -i -e PGPASSWORD=postgres svit_pg psql -U supabase_admin -d "$DB_NAME" -v ON_ERROR_STOP=0 >/dev/null 2>&1 || true
    for f in "$ROOT"/supabase/migrations/*.sql; do
      sed -E 's/^AS \$[[:space:]]*$/AS $$/; s/^\$;[[:space:]]*$/$$;/; /storage\.buckets/d' "$f" | \
        docker exec -i -e PGPASSWORD=postgres svit_pg psql -U supabase_admin -d "$DB_NAME" -v ON_ERROR_STOP=0 >/dev/null 2>&1 || true
    done
    for f in "$ROOT"/new_database/*.sql; do
      sed -E 's/^AS \$[[:space:]]*$/AS $$/; s/^\$;[[:space:]]*$/$$;/; /storage\.buckets/d' "$f" | \
        docker exec -i -e PGPASSWORD=postgres svit_pg psql -U supabase_admin -d "$DB_NAME" -v ON_ERROR_STOP=0 >/dev/null 2>&1 || true
    done
    docker exec -e PGPASSWORD=postgres svit_pg psql -U supabase_admin -d "$DB_NAME" -q \
      -c "DO \$\$ DECLARE t record; BEGIN FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t.tablename); END LOOP; END \$\$;" \
      -c "GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;" \
      -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;" \
      -c "GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;" >/dev/null 2>&1 || true
  fi

  docker run -d --name admv1_pgrst --network "$NETWORK" --add-host host.docker.internal:host-gateway \
    -p "$PGRST_PORT":3000 \
    -e PGRST_DB_URI="postgres://authenticator:postgres@host.docker.internal:$DB_PORT/$DB_NAME" \
    -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
    -e PGRST_JWT_SECRET="$JWT_SECRET" -e PGRST_SERVER_PORT=3000 \
    postgrest/postgrest:v12.2.3 >/dev/null
  sleep 5

  # Apply demo seed data (idempotent).
  docker exec -i -e PGPASSWORD=postgres svit_pg psql -U supabase_admin -d "$DB_NAME" -v ON_ERROR_STOP=0 \
    -f - < "$ROOT/scripts/local-seed.sql" >/dev/null 2>&1 || true

  # Start the gateway.
  pkill -f "admv1-gateway.mjs" >/dev/null 2>&1 || true
  cat > /tmp/admv1-gateway.mjs <<EOF
import http from 'node:http';
const routes = [
  { prefix: '/auth/v1', target: 'http://127.0.0.1:$GOTRUE_PORT' },
  { prefix: '/rest/v1', target: 'http://127.0.0.1:$PGRST_PORT' },
];
const server = http.createServer((req, res) => {
  const route = routes.find((item) => req.url.startsWith(item.prefix));
  if (!route) { res.writeHead(404, { 'content-type': 'application/json' }); res.end(JSON.stringify({ message: 'not found' })); return; }
  const path = req.url.slice(route.prefix.length) || '/';
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const proxy = http.request(route.target + path, {
      method: req.method,
      headers: { ...req.headers, host: new URL(route.target).host, 'content-length': Buffer.concat(chunks).length },
    }, (upstream) => { res.writeHead(upstream.statusCode ?? 500, upstream.headers); upstream.pipe(res); });
    proxy.on('error', (e) => { res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ message: e.message })); });
    if (chunks.length) proxy.write(Buffer.concat(chunks));
    proxy.end();
  });
});
server.listen($GATEWAY_PORT, '127.0.0.1', () => console.log('admv1 gateway on 127.0.0.1:$GATEWAY_PORT'));
EOF
  nohup node /tmp/admv1-gateway.mjs >/tmp/admv1-gateway.log 2>&1 &
  sleep 1

  echo "stack is up: http://127.0.0.1:$GATEWAY_PORT"
  "$0" env
}

print_env() {
  cat <<EOF
# Put these in .env to run the app against the local stack
PUBLIC_SUPABASE_URL=http://127.0.0.1:$GATEWAY_PORT
PUBLIC_SUPABASE_ANON_KEY=$(mint_key anon)
SUPABASE_SERVICE_ROLE_KEY=$(mint_key service_role)
EOF
}

case "${1:-up}" in
  up) start_stack ;;
  down)
    docker rm -f admv1_pgrst admv1_gotrue >/dev/null 2>&1 || true
    pkill -f "admv1-gateway.mjs" >/dev/null 2>&1 || true
    echo "admission local stack stopped"
    ;;
  env) print_env ;;
  *) echo "usage: $0 [up|down|env]" >&2; exit 1 ;;
esac
