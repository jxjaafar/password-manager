const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createStorageHandler } = require('./storage-api.cjs');
const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/style.css': ['style.css', 'text/css'], '/magic.css': ['magic.css', 'text/css'], '/app.js': ['app.js', 'text/javascript'] };
files['/password-manager.js'] = ['password-manager.js', 'text/javascript'];
files['/vault-storage.js'] = ['vault-storage.js', 'text/javascript'];
files['/account-ui.js'] = ['account-ui.js', 'text/javascript'];
function createServer(store = null, options = {}) {
const handleStorage = createStorageHandler(store, options);
return http.createServer(async (req, res) => {
  const file = files[req.url.split('?')[0]];
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  if (await handleStorage(req, res)) return;
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(path.join(__dirname, file[0]), (error, data) => { if (error) { res.writeHead(500); res.end('Unable to load resource'); return; } res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8` }); res.end(data); });
});
}
async function start() {
  require('dotenv').config({ quiet: true });
  const enabled = process.env.MYSQL_ENABLED === 'true';
  const host = process.env.HOST || '127.0.0.1';
  const store = enabled ? await require('./database.cjs').connectStore() : null;
  const server = createServer(store, { secureCookies: process.env.NODE_ENV === 'production' });
  server.listen(Number(process.env.PORT) || 3000, host, () => console.log(`Password: http://localhost:${server.address().port} — ${enabled ? 'MySQL connected' : 'browser-local storage'}`));
  const close = () => server.close(async () => {
    if (store) { await store.close(); }
    process.exit(0);
  });
  process.on('SIGINT', close); process.on('SIGTERM', close);
}
if (require.main === module) start().catch(error => { console.error(`Server failed (${error.code || 'configuration'}). Check .env, start MySQL, and run npm run db:setup.`); process.exitCode = 1; });
module.exports = { createServer };
