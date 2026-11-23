PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS vaults (
  vault_id TEXT PRIMARY KEY,
  representation TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS accounts (
  account_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  vault_id TEXT NOT NULL UNIQUE REFERENCES vaults(vault_id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  session_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_limits (
  limit_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS vault_entries (
  entry_id INTEGER PRIMARY KEY AUTOINCREMENT,
  vault_id TEXT NOT NULL REFERENCES vaults(vault_id) ON DELETE CASCADE,
  domain_tag TEXT NOT NULL,
  encrypted_password TEXT NOT NULL,
  password_nonce TEXT NOT NULL,
  encrypted_account_details TEXT,
  account_details_nonce TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(vault_id, domain_tag)
);
CREATE VIEW IF NOT EXISTS password_demo AS
SELECT entry_id,
       substr(domain_tag, 1, 12) || '...' AS account_reference,
       substr(encrypted_password, 1, 24) || '...' AS encrypted_password,
       password_nonce,
       created_at,
       updated_at
FROM vault_entries;
