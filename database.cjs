const mysql = require('mysql2/promise');
const fs = require('node:fs');
const path = require('node:path');

function config(env = process.env) {
  const database = env.MYSQL_DATABASE || 'password_manager';
  if (!/^[A-Za-z0-9_]{1,64}$/.test(database)) throw new Error('Invalid MYSQL_DATABASE name');
  return {
    host: env.MYSQL_HOST || '127.0.0.1', port: Number(env.MYSQL_PORT || 3306),
    user: env.MYSQL_USER || 'root', password: env.MYSQL_PASSWORD || '', database,
    connectionLimit: 5, connectTimeout: 5000,
    ...(env.MYSQL_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {})
  };
}
function createStore(pool) {
  return {
    async get(id) {
      const [rows] = await pool.execute('SELECT representation, revision FROM vaults WHERE vault_id = ?', [id]);
      return rows[0] || { representation: null, revision: 0 };
    },
    async save(id, representation, revision) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.execute('INSERT IGNORE INTO vaults (vault_id) VALUES (?)', [id]);
        const [result] = await connection.execute('UPDATE vaults SET representation = ?, revision = revision + 1 WHERE vault_id = ? AND revision = ?', [representation, id, revision]);
        if (result.affectedRows !== 1) {
          const error = new Error('Vault changed in another tab. Reload before saving.'); error.status = 409; throw error;
        }
        await connection.commit();
        return { revision: revision + 1 };
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    close: () => pool.end()
  };
}
async function connectStore(env = process.env) {
  const pool = mysql.createPool(config(env));
  try { await pool.execute('SELECT vault_id FROM vaults LIMIT 0'); return createStore(pool); }
  catch (error) { await pool.end(); throw error; }
}
async function setup() {
  require('dotenv').config({ quiet: true });
  const options = config(), database = options.database;
  delete options.database; delete options.connectionLimit;
  const connection = await mysql.createConnection(options);
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`);
    await connection.changeUser({ database });
    await connection.query(fs.readFileSync(path.join(__dirname, 'database/schema.sql'), 'utf8'));
    console.log(`MySQL ready: ${database}.vaults`);
  } finally { await connection.end(); }
}
if (require.main === module) setup().catch(error => { console.error(`MySQL setup failed (${error.code || 'error'}). Check your .env credentials and database permissions.`); process.exitCode = 1; });
module.exports = { config, createStore, connectStore };
