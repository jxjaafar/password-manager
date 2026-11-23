# Project 1 requirements mapping

Based on the supplied ICS 3201 documentation. Submit [password-manager.js](./password-manager.js) for the core code component; the UI is an optional companion.

| Requirement | Implementation and verification |
| --- | --- |
| Required `Keychain` API | init/load/dump/set/get/remove; round-trip, missing-key, update and deletion tests |
| Object dictionary serialized as `kvs` | Null-prototype object; modified kvs is actually restored in tests |
| Individual record encryption | Per-record AES-256-GCM; updating one leaves other ciphertexts unchanged |
| Hidden domain indexes | HMAC-SHA-256 under a separate domain key; no plaintext domains in core output |
| Password length hiding | 258-byte padding; ciphertext sizes checked for empty, ASCII, null-containing and 64-emoji inputs |
| PBKDF2 once and HMAC key separation | One deriveKey call in the shared keys helper; distinct HMAC context labels |
| Random salt and nonces | 128-bit salt, 96-bit GCM IV; variation tested |
| Wrong-password detection | Encrypted verifier; empty and populated vault tests |
| Independent swap protection | Index-bound GCM AAD; swaps rejected without a checksum |
| Rollback protection | Exact-string SHA-256 with external current trusted reference; old snapshots/records rejected |
| No serialized keys or master password | Non-extractable keys in private fields; output inspected |
| Runtime targets | Dictionary get/set/remove; linear load/dump; fetch does not scan the KVS |
| Six short answers | [SHORT-ANSWERS.md](./SHORT-ANSWERS.md) |

The original starter and official grading tests were not provided. These tests are functional/adversarial checks, not a formal security proof or a claim of autograder compatibility. PBKDF2 timing depends on hardware. All binary fields and the SHA-256 checksum use Base64.

## Additional database checkpoint

The Node/MySQL layer is implemented in [database.cjs](./database.cjs), [storage-api.cjs](./storage-api.cjs), and [database/schema.sql](./database/schema.sql). It stores the exact encrypted representation without changing the required core API. Browser integration uses [vault-storage.js](./vault-storage.js), with account sign-in through [account-ui.js](./account-ui.js). Account login uses a separate salted scrypt password hash and hashed server-side sessions. The Netlify Function uses the same authenticated API adapter and requires hosted MySQL with verified TLS. `npm test` covers cross-browser account retrieval, isolation, logout, conflicts, validation, and backend failures; `npm run test:db` exercises real MySQL, including legacy-vault linking. Credentials remain outside GitHub. See [DEPLOYMENT.md](./DEPLOYMENT.md) for the external hosted database configuration needed before the live Netlify connection can be verified.
