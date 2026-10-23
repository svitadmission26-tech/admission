// Unified entry portal for the SVIT admission software.
// Serves a single page (port 3000) that embeds both applications module-wise:
//   - React ERP (port 5173)
//   - SvelteKit admission app (port 4040)
// Run with: node portal-server.mjs
import http from 'node:http';

const PORT = Number(process.env.PORTAL_PORT || 3000);

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SVIT Admission Software — Unified Portal</title>
<style>
  :root { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
  body { margin: 0; background: #0f172a; color: #e2e8f0; }
  header { padding: 12px 20px; background: #1e293b; display: flex; align-items: center; gap: 16px; }
  header h1 { font-size: 18px; margin: 0; }
  header small { color: #94a3b8; }
  .tabs { display: flex; gap: 8px; padding: 8px 20px; background: #111827; }
  .tab { padding: 8px 16px; border: 1px solid #334155; background: #1e293b; color: #e2e8f0; border-radius: 6px; cursor: pointer; }
  .tab.active { background: #2563eb; border-color: #2563eb; }
  .frame-wrap { height: calc(100vh - 96px); }
  iframe { width: 100%; height: 100%; border: 0; background: #fff; }
  .note { padding: 6px 20px; font-size: 12px; color: #94a3b8; }
  a { color: #60a5fa; }
</style>
</head>
<body>
<header>
  <h1>SVIT Admission Software — Unified Portal</h1>
  <small>One entry point · modules loaded below</small>
</header>
<div class="tabs">
  <button class="tab active" data-target="erp">React ERP (port 5173)</button>
  <button class="tab" data-target="adm">Admission App (port 4040)</button>
</div>
<div class="frame-wrap">
  <iframe id="erp" title="React ERP"></iframe>
  <iframe id="adm" title="Admission App" style="display:none"></iframe>
</div>
<div class="note">
  Direct links: <a href="http://localhost:5173/" target="_blank">React ERP</a> ·
  <a href="http://localhost:4040/" target="_blank">Admission App</a> ·
  <a href="http://localhost:8020/" target="_blank">Supabase gateway</a>
</div>
<script>
  function appUrl(port) {
    const origin = window.location.origin;
    // Codespace forwarded URL: replace the portal port segment.
    if (origin.includes('.app.github.dev')) {
      return origin.replace(/-\\d+\\.app\\.github\\.dev/, '-' + port + '.app.github.dev');
    }
    return 'http://localhost:' + port + '/';
  }
  const frames = { erp: document.getElementById('erp'), adm: document.getElementById('adm') };
  frames.erp.src = appUrl(5173);
  frames.adm.src = appUrl(4040);
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach((t) => {
    t.addEventListener('click', () => {
      tabs.forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      const key = t.dataset.target;
      Object.keys(frames).forEach((k) => { frames[k].style.display = k === key ? 'block' : 'none'; });
    });
  });
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, services: { erp: 5173, admission: 4040, supabase: 8020 } }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(page);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Unified portal listening on http://0.0.0.0:${PORT}`);
});
