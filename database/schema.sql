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
