const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/style.css': ['style.css', 'text/css'], '/magic.css': ['magic.css', 'text/css'], '/app.js': ['app.js', 'text/javascript'] };
files['/password-manager.js'] = ['password-manager.js', 'text/javascript'];
const server = http.createServer((req, res) => {
  const file = files[req.url.split('?')[0]];
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(path.join(__dirname, file[0]), (error, data) => { if (error) { res.writeHead(500); res.end('Unable to load resource'); return; } res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8` }); res.end(data); });
});
server.listen(Number(process.env.PORT) || 3000, '127.0.0.1', () => console.log(`Password is running at http://localhost:${server.address().port}`));
