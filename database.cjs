const mysql = require('mysql2/promise');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');

function config(env = process.env) {
  const database = env.MYSQL_DATABASE || 'password_manager';
  if (!/^[A-Za-z0-9_]{1,64}$/.test(database)) throw new Error('Invalid MYSQL_DATABASE name');
  return {
    host: env.MYSQL_HOST || '127.0.0.1', port: Number(env.MYSQL_PORT || 3306),
    user: env.MYSQL_USER || 'root', password: env.MYSQL_PASSWORD || '', database,
    connectionLimit: 3, connectTimeout: 5000,
    ...(env.MYSQL_SSL === 'true' ? { ssl: { rejectUnauthorized: true, ...(env.MYSQL_SSL_CA ? { ca: env.MYSQL_SSL_CA.replace(/\\n/g, '\n') } : {}) } } : {})
  };
}
async function synchronizeEntries(connection, id, representation) {
  const data = representation ? JSON.parse(representation) : null;
  const kvs = data?.version === 2 ? data.kvs : {};
  const tags = Object.keys(kvs);
  if (!tags.length) {
    await connection.execute('DELETE FROM vault_entries WHERE vault_id = ?', [id]);
    return;
  }
  await connection.execute(`DELETE FROM vault_entries WHERE vault_id = ? AND domain_tag NOT IN (${tags.map(() => '?').join(',')})`, [id, ...tags]);
  for (const [tag, record] of Object.entries(kvs)) {
    const metadata = data.metadata?.[tag];
    await connection.execute(
      `INSERT INTO vault_entries (vault_id, domain_tag, encrypted_password, password_nonce, encrypted_account_details, account_details_nonce)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE encrypted_password = VALUES(encrypted_password), password_nonce = VALUES(password_nonce),
       encrypted_account_details = VALUES(encrypted_account_details), account_details_nonce = VALUES(account_details_nonce)`,
      [id, tag, record.ciphertext, record.iv, metadata?.ciphertext || null, metadata?.iv || null]
    );
  }
}
function createStore(pool) {
  return {
    async findAccount(email) {
      const [rows] = await pool.execute('SELECT account_id, email, password_hash, vault_id FROM accounts WHERE email = ?', [email]);
      return rows[0] || null;
    },
    async registerAccount(email, passwordHash, legacyId) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        let id = null;
        if (legacyId) {
          const [legacy] = await connection.execute('SELECT vault_id FROM vaults WHERE vault_id = ? AND representation IS NOT NULL FOR UPDATE', [legacyId]);
          if (legacy.length) {
            const [owners] = await connection.execute('SELECT account_id FROM accounts WHERE vault_id = ?', [legacyId]);
            if (!owners.length) id = legacyId;
          }
        }
        if (!id) {
          id = randomBytes(32).toString('hex');
          await connection.execute('INSERT INTO vaults (vault_id) VALUES (?)', [id]);
        }
        const account = { account_id: randomUUID(), email, vault_id: id };
        await connection.execute('INSERT INTO accounts (account_id, email, password_hash, vault_id) VALUES (?, ?, ?, ?)', [account.account_id, email, passwordHash, id]);
        await connection.commit(); return account;
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async createSession(hash, accountId) {
      await pool.execute('DELETE FROM sessions WHERE expires_at <= UTC_TIMESTAMP()');
      await pool.execute('INSERT INTO sessions (session_hash, account_id, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY))', [hash, accountId]);
    },
    async session(hash) {
      const [rows] = await pool.execute('SELECT a.account_id, a.email, a.vault_id FROM sessions s JOIN accounts a ON a.account_id = s.account_id WHERE s.session_hash = ? AND s.expires_at > UTC_TIMESTAMP()', [hash]);
      return rows[0] || null;
    },
    async logout(hash) { await pool.execute('DELETE FROM sessions WHERE session_hash = ?', [hash]); },
    async limit(key, maximum = 10) {
      await pool.execute(`INSERT INTO auth_limits (limit_key, attempts, window_start) VALUES (?, 1, UTC_TIMESTAMP())
        ON DUPLICATE KEY UPDATE attempts = IF(window_start < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE), 1, attempts + 1),
        window_start = IF(window_start < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE), UTC_TIMESTAMP(), window_start)`, [key]);
      const [rows] = await pool.execute('SELECT attempts FROM auth_limits WHERE limit_key = ?', [key]);
      return rows[0].attempts <= maximum;
    },
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
        await synchronizeEntries(connection, id, representation);
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
  try { await pool.execute('SELECT account_id FROM accounts LIMIT 0'); await pool.execute('SELECT session_hash FROM sessions LIMIT 0'); await pool.execute('SELECT limit_key FROM auth_limits LIMIT 0'); await pool.execute('SELECT entry_id FROM vault_entries LIMIT 0'); return createStore(pool); }
  catch (error) { await pool.end(); throw error; }
}
async function setup() {
  require('dotenv').config({ quiet: true });
  const options = config(), database = options.database;
  delete options.database; delete options.connectionLimit;
  const connection = await mysql.createConnection(options);
  try {
    try { await connection.changeUser({ database }); }
    catch (error) {
      if (error.code !== 'ER_BAD_DB_ERROR') throw error;
      await connection.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`);
      await connection.changeUser({ database });
    }
    const schema = fs.readFileSync(path.join(__dirname, 'database/schema.sql'), 'utf8');
    for (const statement of schema.split(';').map(value => value.trim()).filter(Boolean)) await connection.query(statement);
    await connection.beginTransaction();
    try {
      const [vaults] = await connection.query('SELECT vault_id, representation FROM vaults FOR UPDATE');
      for (const vault of vaults) await synchronizeEntries(connection, vault.vault_id, vault.representation);
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    console.log(`MySQL ready: ${database}.vaults and ${database}.vault_entries`);
  } finally { await connection.end(); }
}
if (require.main === module) setup().catch(error => { console.error(`MySQL setup failed (${error.code || 'error'}). Check your .env credentials and database permissions.`); process.exitCode = 1; });
module.exports = { config, createStore, connectStore };
