const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
function sqlitePath(env = process.env) { return path.resolve(__dirname, env.SQLITE_PATH || 'database/password-manager.sqlite'); }
function connectSQLite(filename = sqlitePath()) {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  // A single on-disk file is easier to inspect with a read-only VS Code viewer.
  db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = DELETE;');
  db.exec(fs.readFileSync(path.join(__dirname, 'database/sqlite-schema.sql'), 'utf8'));
  const run = (sql, ...values) => db.prepare(sql).run(...values);
  const get = (sql, ...values) => db.prepare(sql).get(...values);
  function transaction(callback) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = callback(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function synchronize(id, representation) {
    const data = representation ? JSON.parse(representation) : null;
    const kvs = data?.version === 2 ? data.kvs : {};
    const existing = db.prepare('SELECT domain_tag FROM vault_entries WHERE vault_id = ?').all(id);
    for (const row of existing) if (!Object.hasOwn(kvs, row.domain_tag)) run('DELETE FROM vault_entries WHERE vault_id = ? AND domain_tag = ?', id, row.domain_tag);
    for (const [tag, record] of Object.entries(kvs)) {
      const meta = data.metadata?.[tag];
      run(`INSERT INTO vault_entries (vault_id, domain_tag, encrypted_password, password_nonce, encrypted_account_details, account_details_nonce)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(vault_id, domain_tag) DO UPDATE SET encrypted_password=excluded.encrypted_password,
        password_nonce=excluded.password_nonce, encrypted_account_details=excluded.encrypted_account_details,
        account_details_nonce=excluded.account_details_nonce, updated_at=datetime('now')`,
      id, tag, record.ciphertext, record.iv, meta?.ciphertext || null, meta?.iv || null);
    }
  }
  return {
    kind: 'sqlite', filename,
    async findAccount(email) { return get('SELECT * FROM accounts WHERE email = ?', email) || null; },
    async registerAccount(email, hash, legacyId) {
      return transaction(() => {
        if (get('SELECT account_id FROM accounts WHERE email = ?', email)) throw Object.assign(new Error('Account exists'), { code: 'ER_DUP_ENTRY' });
        let id = legacyId && get('SELECT vault_id FROM vaults WHERE vault_id = ? AND representation IS NOT NULL', legacyId) && !get('SELECT account_id FROM accounts WHERE vault_id = ?', legacyId) ? legacyId : null;
        if (!id) { id = randomBytes(32).toString('hex'); run('INSERT INTO vaults (vault_id) VALUES (?)', id); }
        const account = { account_id: randomUUID(), email, vault_id: id };
        run('INSERT INTO accounts (account_id, email, password_hash, vault_id) VALUES (?, ?, ?, ?)', account.account_id, email, hash, id);
        return account;
      });
    },
    async createSession(hash, accountId) {
      run('DELETE FROM sessions WHERE expires_at <= ?', Date.now());
      run('INSERT INTO sessions (session_hash, account_id, expires_at) VALUES (?, ?, ?)', hash, accountId, Date.now() + 7 * 86400000);
    },
    async session(hash) {
      return get('SELECT a.account_id, a.email, a.vault_id FROM sessions s JOIN accounts a ON a.account_id = s.account_id WHERE s.session_hash = ? AND s.expires_at > ?', hash, Date.now()) || null;
    },
    async logout(hash) { run('DELETE FROM sessions WHERE session_hash = ?', hash); },
    async limit(key, maximum = 10) {
      return transaction(() => {
        const now = Date.now(), old = get('SELECT attempts, window_start FROM auth_limits WHERE limit_key = ?', key);
        const attempts = old && old.window_start >= now - 900000 ? old.attempts + 1 : 1;
        const start = attempts === 1 ? now : old.window_start;
        run('INSERT INTO auth_limits VALUES (?, ?, ?) ON CONFLICT(limit_key) DO UPDATE SET attempts=excluded.attempts, window_start=excluded.window_start', key, attempts, start);
        return attempts <= maximum;
      });
    },
    async get(id) { return get('SELECT representation, revision FROM vaults WHERE vault_id = ?', id) || { representation: null, revision: 0 }; },
    async save(id, representation, revision) {
      return transaction(() => {
        run('INSERT OR IGNORE INTO vaults (vault_id) VALUES (?)', id);
        const result = run("UPDATE vaults SET representation = ?, revision = revision + 1, updated_at=datetime('now') WHERE vault_id = ? AND revision = ?", representation, id, revision);
        if (result.changes !== 1) throw Object.assign(new Error('Vault changed in another tab. Reload before saving.'), { status: 409 });
        synchronize(id, representation); return { revision: revision + 1 };
      });
    },
    importMySQL(vaults, accounts) {
      return transaction(() => {
        if (get('SELECT COUNT(*) AS count FROM vaults').count || get('SELECT COUNT(*) AS count FROM accounts').count) throw new Error('SQLite already has data. Import cancelled to avoid replacing it.');
        for (const vault of vaults) {
          run('INSERT INTO vaults (vault_id, representation, revision) VALUES (?, ?, ?)', vault.vault_id, vault.representation, vault.revision);
          synchronize(vault.vault_id, vault.representation);
        }
        for (const account of accounts) run('INSERT INTO accounts (account_id, email, password_hash, vault_id) VALUES (?, ?, ?, ?)', account.account_id, account.email, account.password_hash, account.vault_id);
        return { vaults: vaults.length, accounts: accounts.length };
      });
    },
    close() { db.close(); }
  };
}
module.exports = { connectSQLite, sqlitePath };
