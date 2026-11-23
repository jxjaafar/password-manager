# Password

An educational password-manager core for ICS 3201 Project 1, with an optional browser interface and treasure-chest unlock animation. This is not an audited commercial password manager.

## Run

Use Node.js 22 for the full app and Netlify Function. The standalone assignment core also supports Node.js 18. Install dependencies with `npm install`.

## Simple local demo (SQLite)

SQLite is now the default for `npm start`. Use Node.js 22.13 or newer. No MySQL server, database password, or hosted service is needed. The database is created automatically at [database/password-manager.sqlite](./database/password-manager.sqlite) and is ignored by Git. Choose `DATABASE_TYPE=sqlite` in `.env` to make this explicit. Your master password and account password are still required for the app; they are separate from database connection credentials.

1. Run `npm install`, then `npm start` and open http://localhost:3000.
2. Register an account once, then create/unlock its vault. Use the same account to sign in later or from a second browser.
3. In VS Code, install the recommended **SQLite Viewer** extension (`qwtel.sqlite-viewer`). Open [database/password-manager.sqlite](./database/password-manager.sqlite).
4. Select `password_demo` for a compact presentation or `vault_entries` for all per-password encryption columns. `accounts` shows email and salted account-password hashes. `vaults` holds complete encrypted snapshots. `sessions` holds hashed session tokens.
5. Save a fake credential in the app, then refresh the database viewer to show the new row. Site names, usernames, and passwords remain encrypted; show readable values through the unlocked app alongside the database view.

To copy existing encrypted MySQL data into an empty SQLite demo, run `npm run db:import-mysql`. This reads MySQL using the existing private connection settings and leaves it unchanged. It preserves vault IDs and account hashes, but requires signing in again. Unclaimed legacy vaults can be linked by registering once in the original browser, using its existing legacy cookie. The import refuses to replace a nonempty SQLite database. For another browser, an encrypted export/import also works.

The SQLite demo is local. It is not the Netlify persistence backend; Netlify Functions still use hosted MySQL. To run that backend locally instead, choose `DATABASE_TYPE=mysql`, run `npm run db:setup`, and supply MySQL credentials. `DATABASE_TYPE=local` is the explicit browser-only mode. Do not commit your SQLite file or its WAL/SHM sidecars to GitHub. Back up the database with the app stopped or use SQLite's backup facilities; copying only the main file during writes may miss WAL data.

```sh
npm install
npm start
# Open http://localhost:3000
npm run check
npm test
npm run build
```

## Local MySQL connection

This is optional for the local demo. Set `DATABASE_TYPE=mysql` to select it.

The Node server and Netlify Function save encrypted vault snapshots to MySQL. Register an account once, then sign in with the same email and account password from any browser to load the same vault. Unlock it with its separate master password. Only the account password is sent over HTTPS for authentication; its salted scrypt hash is stored in MySQL. The master password, encryption keys, and plaintext website passwords stay in the browser.

1. Start MySQL and copy [.env.example](./.env.example) to `.env`.
2. Set `MYSQL_USER`, `MYSQL_PASSWORD`, host/port, and `MYSQL_DATABASE` (default: `password_manager`). Keep `.env` private; it is ignored by Git. Use a dedicated runtime user with SELECT/INSERT/UPDATE/DELETE permissions on this app's tables. Reserve schema-changing privileges for the setup migration.
3. Run `npm run db:setup` with a user allowed to create the database/table. It creates the schema without dropping existing tables.
4. Run `npm start`. The terminal and UI should say **MySQL connected**.
5. Run `npm run test:db` to verify actual database insert/load/update and conflict behavior. The test removes only its own randomly identified test row.

The [database schema](./database/schema.sql) includes `accounts` (email, salted password hash, vault association), `sessions` (hashed session tokens and expiration), and persistent `auth_limits` for login throttling. `vaults` keeps the exact encrypted snapshot and revision; `vault_entries` provides one row per password with separate encryption columns and timestamps. Snapshot and record rows update together. The snapshot remains authoritative. Run `npm run db:setup` after upgrading to add tables and backfill encrypted rows without decrypting them. Use the [demonstration queries](./database/demo-queries.sql) for a compact presentation. Names, usernames, URLs, notes, and website passwords remain encrypted.

SQL uses prepared statements. Revisions prevent stale tabs from overwriting newer changes. SHA-256 integrity checks still require the separate trusted reference described below; database revision numbers alone are not rollback protection.

Authentication uses random, hashed-at-rest session tokens with seven-day expiry, HttpOnly/SameSite cookies, Secure cookies on Netlify, origin checks, and database-backed per-email/per-IP throttling. The login password hash uses scrypt (N=131072, r=8, p=1, random 16-byte salt). Clearing cookies requires signing in again, not creating a new vault. Sign out revokes that session. Email is stored in plaintext for account lookup. There is no email verification or account-password reset yet. These features and independent auditing are needed before treating the project as a production password manager.

When upgrading locally, register once in the same browser and hostname that used the old MySQL vault. Its existing legacy cookie can link an unclaimed vault to the new account transactionally. An owned vault cannot be claimed by a second account. If the legacy cookie is lost, restore an encrypted backup instead. LocalStorage data is retained but is not silently assigned to newly registered accounts. MySQL is authoritative in account mode. Missing/unreachable hosted APIs show an error rather than silently creating a browser-only vault. `MYSQL_ENABLED=false` remains an explicit local development mode only.

Create a unique master passphrase of at least 12 characters. Add, edit, search, favorite, copy, and delete credentials. Passwords support at most 64 Unicode code points. The generator creates 12-64 characters. The vault locks after five minutes of inactivity. Legacy version 1 vaults migrate on successful unlock. Passwords over 64 characters block migration without changing saved data: use the previous app version to shorten them first.

## Assignment submission

Submit only [password-manager.js](./password-manager.js) for the code component. All core cryptographic functionality is self-contained in that file. The interface, tests, and deployment files are optional companions. The original starter and official autograder were not supplied; verify their export conventions before submission. The current Node export is `{ Keychain }`.

```js
const { Keychain } = require('./password-manager.js');
const chain = await Keychain.init('a long unique master passphrase');
await chain.set('www.example.com', 'unique website password');
console.log(await chain.get('www.example.com'));
const [representation, trustedDataCheck] = await chain.dump();
// Keep trustedDataCheck separately in trusted storage.
const restored = await Keychain.load('a long unique master passphrase', representation, trustedDataCheck);
console.log(await restored.remove('www.example.com')); // true
console.log(await restored.get('www.example.com')); // null
```

| API | Result | Runtime in record count |
| --- | --- | --- |
| `Keychain.init(password)` | New unlocked Keychain | O(1) |
| `Keychain.load(password, representation, trustedDataCheck?)` | Authenticated Keychain; throws on failure | O(n) |
| `dump()` | `[JSON representation, Base64 SHA-256 checksum]` | O(n) |
| `set(name, value)` | Inserts or replaces a password | O(1) |
| `get(name)` | Password or `null` | O(1) |
| `remove(name)` | Boolean indicating removal | O(1) |

Complexity assumes bounded inputs and expected constant-time dictionary access as in the assignment. Loading authenticates every record once; fetching decrypts only the requested record. Optional browser helpers `setMetadata`, `entries`, and `loadFromLive` support the interface. The browser uses random record IDs as lookup names to permit multiple accounts for one website; the standalone API accepts domains directly. The UI lists encrypted metadata and serializes on save, so full-list UI operations are O(n).

## Cryptographic design

- PBKDF2-HMAC-SHA-256 runs once per init/load with 600,000 iterations and a random 128-bit salt. HMAC evaluates two distinct context labels to derive separate 256-bit domain-index and AES keys. Measure work-factor timing on the submission machine; the assignment's approximate 0.5-1 second target depends on hardware.
- The serialized `kvs` object maps Base64 HMAC domain tags to individual AES-256-GCM records. No master password, raw password hash, or secret key is serialized. An encrypted verification record authenticates the master password even for an empty database.
- Passwords use fixed 258-byte plaintexts: a two-byte UTF-8 byte length, up to 256 password bytes, and zero padding. This supports up to 64 Unicode code points. Ciphertexts are always 274 bytes including the 128-bit GCM tag. Each encryption has a fresh random 96-bit nonce.
- GCM additional authenticated data binds the record type and HMAC dictionary index. Moving ciphertext between domains fails authentication independently of the checksum.
- `dump` hashes its exact JSON string with SHA-256. `load` checks an optional trusted checksum before key derivation. An authentic current checksum must be retained separately from attacker-controlled data. Without it, old authentic snapshots and deletion of records cannot be detected.
- Browser metadata is separately encrypted and bound to the record index with a different context. It contains no password and uses one-digit numeric strength categories. Metadata lengths and record counts remain visible. The core stores no domain text or metadata unless the optional UI helpers are used.
- Random password generation uses Web Crypto with rejection sampling. Strength categories are heuristics, not breach checks.

## Backups and trusted checksums

Export downloads the exact serialized vault and displays its Base64 SHA-256 checksum. Save that checksum separately, for example on a trusted removable drive. Enter it at unlock to verify that exact snapshot. Refresh your trusted reference after changes: an older checksum intentionally rejects a newer vault. Keeping the checksum beside an attacker-controlled backup does not prevent rollback.

Import authenticates the backup with its master password and optional trusted checksum before replacing the current vault. Back up your current vault first. Legacy backups do not support checksum verification. There is no password recovery.

## Netlify hosting

Connect the GitHub repository to Netlify. [netlify.toml](./netlify.toml) builds `dist` and bundles [the API Function](./netlify/functions/api.mjs) at `/api/*`. Pushes rebuild both frontend and backend. Uploading only `dist` with drag-and-drop is insufficient for this account-backed version.

Follow [DEPLOYMENT.md](./DEPLOYMENT.md): provision hosted MySQL, run the schema setup against it, add its credentials to Netlify's Functions environment settings, and redeploy. Netlify cannot reach the MySQL server at your computer's `127.0.0.1`. The Function refuses localhost and requires verified TLS. Optional `MYSQL_SSL_CA` supports a provider's CA certificate. No MySQL credentials are embedded in the frontend or committed to GitHub.

## Limits

This educational design does not protect an unlocked browser against malware, malicious extensions, compromised scripts, OS attackers, or clipboard monitoring. JavaScript cannot guarantee physical memory erasure. Rollback protection requires an independently trusted, current checksum. There is no shared-site multi-user collaboration, PQC exchange, or breach lookup. Accounts enable cross-browser retrieval and optimistic conflict detection; refresh to fetch another browser's latest changes before editing. Hosted requests are limited to 4 MB. Account and master passwords have separate roles, with no recovery implemented for either.

See [SHORT-ANSWERS.md](./SHORT-ANSWERS.md) and [REQUIREMENTS.md](./REQUIREMENTS.md) for the assignment explanations and coverage.
