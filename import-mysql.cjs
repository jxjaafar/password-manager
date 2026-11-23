require('dotenv').config({ quiet: true });
async function migrate() {
  const mysql = require('mysql2/promise');
  const connection = await mysql.createConnection(require('./database.cjs').config());
  const sqlite = require('./sqlite-store.cjs').connectSQLite();
  try {
    await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    const [vaults] = await connection.query('SELECT vault_id, representation, revision FROM vaults');
    const [tables] = await connection.query("SHOW TABLES LIKE 'accounts'");
    const accounts = tables.length ? (await connection.query('SELECT account_id, email, password_hash, vault_id FROM accounts'))[0] : [];
    const result = sqlite.importMySQL(vaults, accounts);
    await connection.commit();
    console.log(`Copied ${result.vaults} encrypted vault(s) and ${result.accounts} account(s) to SQLite. MySQL was not changed. Sign in again if you had an account; legacy cookies can link unclaimed vaults during registration.`);
  } finally { sqlite.close(); await connection.end(); }
}
migrate().catch(error => { console.error(`Import failed: ${error.code || error.message}`); process.exitCode = 1; });
