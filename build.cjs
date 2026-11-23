const fs = require('node:fs');
const path = require('node:path');
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
for (const file of ['index.html', 'app.js', 'password-manager.js', 'vault-storage.js', 'style.css', 'magic.css']) {
  fs.copyFileSync(path.join(__dirname, file), path.join(__dirname, 'dist', file));
}
fs.copyFileSync(path.join(__dirname, '_headers'), path.join(__dirname, 'dist', '_headers'));
console.log('Static site ready in dist/');
