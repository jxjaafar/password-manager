require('dotenv').config({ quiet: true });
async function setup() {
  const type = process.env.DATABASE_TYPE || 'sqlite';
  if (type === 'sqlite') {
    const store = require('./sqlite-store.cjs').connectSQLite();
    console.log(`SQLite ready: ${store.filename}`); store.close();
  } else if (type === 'mysql') await require('./database.cjs').setup();
  else throw new Error('DATABASE_TYPE must be sqlite or mysql');
}
setup().catch(error => { console.error(error.message); process.exitCode = 1; });
