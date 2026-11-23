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
