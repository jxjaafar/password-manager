const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createStorageHandler } = require('./storage-api.cjs');
const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/style.css': ['style.css', 'text/css'], '/magic.css': ['magic.css', 'text/css'], '/app.js': ['app.js', 'text/javascript'] };
files['/password-manager.js'] = ['password-manager.js', 'text/javascript'];
files['/vault-storage.js'] = ['vault-storage.js', 'text/javascript'];
files['/account-ui.js'] = ['account-ui.js', 'text/javascript'];
function openChrome(url) {
  const platform = process.platform;
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd.exe' : 'google-chrome';
  const args = platform === 'darwin' ? ['-a', 'Google Chrome', url] : platform === 'win32' ? ['/c', 'start', '', 'chrome', url] : [url];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  const report = () => console.log(`Chrome could not open automatically. Open ${url} in your browser.`);
  child.once('error', report);
  child.once('exit', code => { if (code) report(); });
  child.unref();
}
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
  const type = process.env.DATABASE_TYPE || 'sqlite';
  const host = process.env.HOST || '127.0.0.1';
  if (!['sqlite', 'mysql', 'local'].includes(type)) throw new Error('Unknown DATABASE_TYPE');
  const store = type === 'sqlite' ? require('./sqlite-store.cjs').connectSQLite() : type === 'mysql' ? await require('./database.cjs').connectStore() : null;
  const server = createServer(store, { secureCookies: process.env.NODE_ENV === 'production' });
  server.listen(Number(process.env.PORT) || 3000, host, () => {
    const browserHost = host === '127.0.0.1' || host === '0.0.0.0' ? 'localhost' : host.includes(':') ? `[${host}]` : host;
    const url = `http://${browserHost}:${server.address().port}`;
    console.log(`Password: ${url} — ${type} storage`);
    if (type === 'sqlite') console.log(`Database file: ${store.filename}`);
    if (process.env.OPEN_BROWSER !== 'false' && process.env.NODE_ENV !== 'production' && !process.env.CI) openChrome(url);
  });
  const close = () => server.close(async () => {
    if (store) { await store.close(); }
    process.exit(0);
  });
  process.on('SIGINT', close); process.on('SIGTERM', close);
}
if (require.main === module) start().catch(error => { console.error(`Server failed (${error.code || 'configuration'}): check DATABASE_TYPE and run npm run db:setup. SQLite requires Node.js 22.13 or newer.`); process.exitCode = 1; });
module.exports = { createServer };
