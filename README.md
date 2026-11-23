# Password

An educational password-manager core for ICS 3201 Project 1, with an optional browser interface and treasure-chest unlock animation. This is not an audited commercial password manager.

## Run

Requires Node.js 18 or newer; no dependencies to install.

```sh
npm start
# Open http://localhost:3000
npm run check
npm test
npm run build
```

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

Vaults stay in each visitor's browser. Hosting does not add accounts, shared storage, or automatic synchronization. Export/import moves a vault between origins. The local server listens only on loopback and supplies CSP, MIME sniffing protection, no-referrer, and no-cache headers.

## Limits

This educational design does not protect an unlocked browser against malware, malicious extensions, compromised scripts, OS attackers, or clipboard monitoring. JavaScript cannot guarantee physical memory erasure. Clearing browser storage may destroy the vault. Rollback protection requires an independently trusted, current checksum. There is no multi-user sharing, online sync, PQC exchange, or breach lookup.

See [SHORT-ANSWERS.md](./SHORT-ANSWERS.md) and [REQUIREMENTS.md](./REQUIREMENTS.md) for the assignment explanations and coverage.
