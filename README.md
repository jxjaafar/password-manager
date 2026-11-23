# Password

An educational password-manager core for ICS 3201 Project 1, with an optional browser interface and treasure-chest unlock animation. This is not an audited commercial password manager.

## Run

Requires Node.js 18 or newer. Install the server dependencies with `npm install`.

```sh
npm install
npm start
# Open http://localhost:3000
npm run check
npm test
npm run build
```

## Local MySQL connection

The existing Node server now saves encrypted vault snapshots to MySQL. Browser-side cryptography and the assignment core are unchanged; the master password, encryption keys, and plaintext website passwords are never sent to the server. No account-password hashing or account login has been added in this checkpoint.

1. Start MySQL and copy [.env.example](./.env.example) to `.env`.
2. Set `MYSQL_USER`, `MYSQL_PASSWORD`, host/port, and `MYSQL_DATABASE` (default: `password_manager`). Keep `.env` private; it is ignored by Git. The root example is for local setup only; a dedicated runtime user with SELECT/INSERT/UPDATE permissions on `vaults` is preferable.
3. Run `npm run db:setup` with a user allowed to create the database/table. It creates the schema without dropping existing tables.
4. Run `npm start`. The terminal and UI should say **MySQL connected**.
5. Run `npm run test:db` to verify actual database insert/load/update and conflict behavior. The test removes only its own randomly identified test row.

The [database schema](./database/schema.sql) contains two tables: `vaults` keeps the exact encrypted snapshot and revision for checksum verification; `vault_entries` provides one row per saved password, with an entry ID, vault ID, protected domain tag, encrypted password, password nonce, encrypted account details, account-details nonce, and timestamps. Both update in the same transaction. `vault_entries` is a presentation/query projection; the snapshot remains authoritative. Run `npm run db:setup` after upgrading to create the new table and backfill existing version 2 vaults without decrypting them. Legacy snapshots populate individual rows after upgrade on unlock. Use the [demonstration queries](./database/demo-queries.sql) to display a compact table. Names, usernames, URLs, notes, and passwords remain encrypted; ciphertext still looks random. Never edit projection rows manually to change a password: use the app.

SQL uses prepared statements. Revisions prevent stale tabs from overwriting newer changes. SHA-256 integrity checks still require the separate trusted reference described below; database revision numbers alone are not rollback protection.

A random persistent HttpOnly, SameSite cookie identifies each browser's vault. This is a **local demonstration**, not account login or multi-device synchronization. Keep the server on loopback; the configured MySQL startup rejects non-loopback binding. Losing the cookie loses the browser's association with its database row, so keep encrypted exports. Cookie identifiers are scoped by hostname, not port; use a dedicated hostname/profile when running multiple installations. A new browser gets a separate vault. Account authentication must be implemented before a public multi-user deployment.

Existing localStorage data is retained and copied to an empty MySQL vault only after successful unlock. Once connected, MySQL is authoritative; subsequent saves are not silently written to localStorage. If MySQL fails, the app reports the error. When `MYSQL_ENABLED=false` or on a static Netlify host without the API, browser-local mode remains available and is labeled as such. Static Netlify hosting alone does not run the MySQL backend. Full hosted database access is deferred until authentication and backend deployment are configured.

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

Connect this GitHub repository to Netlify. [netlify.toml](./netlify.toml) runs `npm run build` and publishes `dist`. Pushes to the production branch rebuild from current source. For manual deployment, build and upload `dist` to the existing project's deploy page. The build includes the core library and restrictive security headers. Use HTTPS for remote hosting.

This Netlify configuration deploys only the browser app. It uses browser storage, not MySQL. The database-backed mode runs through `npm start` locally. Neither mode currently adds accounts or cross-device synchronization. Export/import moves vaults between origins. The local server supplies CSP, MIME sniffing protection, no-referrer, and no-cache headers.

## Limits

This educational design does not protect an unlocked browser against malware, malicious extensions, compromised scripts, OS attackers, or clipboard monitoring. JavaScript cannot guarantee physical memory erasure. Clearing browser storage may destroy the vault. Rollback protection requires an independently trusted, current checksum. There is no multi-user sharing, online sync, PQC exchange, or breach lookup.

See [SHORT-ANSWERS.md](./SHORT-ANSWERS.md) and [REQUIREMENTS.md](./REQUIREMENTS.md) for the assignment explanations and coverage.
