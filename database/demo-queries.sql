-- Compact table for a presentation: one row represents one saved password.
SELECT entry_id,
       CONCAT(LEFT(domain_tag, 12), '...') AS protected_account,
       CONCAT(LEFT(encrypted_password, 20), '...') AS encrypted_password_preview,
       password_nonce,
       created_at,
       updated_at
FROM vault_entries
ORDER BY entry_id;

-- All stored columns, including encrypted account name/username/URL/notes.
SELECT * FROM vault_entries;

-- Show how many individually encrypted passwords belong to each vault.
SELECT LEFT(v.vault_id, 12) AS vault_reference, v.revision, COUNT(e.entry_id) AS saved_passwords
FROM vaults v LEFT JOIN vault_entries e ON e.vault_id = v.vault_id
GROUP BY v.vault_id, v.revision;
