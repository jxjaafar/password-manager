-- Run inside the configured password_manager database.
-- representation retains the exact JSON string for trusted checksum verification.
-- Passwords inside it are individually encrypted by the browser, never plaintext.
CREATE TABLE IF NOT EXISTS vaults (
  vault_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  representation LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS accounts (
  account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  email VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  password_hash VARCHAR(256) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  vault_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_account_vault FOREIGN KEY (vault_id) REFERENCES vaults(vault_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sessions (
  session_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at DATETIME NOT NULL,
  INDEX session_expiry (expires_at),
  CONSTRAINT fk_session_account FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS auth_limits (
  limit_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  window_start DATETIME NOT NULL
) ENGINE=InnoDB;

-- One visible row per password, maintained transactionally from the encrypted vault.
-- The exact snapshot above remains authoritative for checksum verification.
CREATE TABLE IF NOT EXISTS vault_entries (
  entry_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  vault_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  domain_tag CHAR(44) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  encrypted_password VARCHAR(368) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  password_nonce CHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  encrypted_account_details MEDIUMTEXT CHARACTER SET ascii COLLATE ascii_bin NULL,
  account_details_nonce CHAR(16) CHARACTER SET ascii COLLATE ascii_bin NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_vault_domain (vault_id, domain_tag),
  CONSTRAINT fk_entry_vault FOREIGN KEY (vault_id) REFERENCES vaults(vault_id) ON DELETE CASCADE
) ENGINE=InnoDB;
