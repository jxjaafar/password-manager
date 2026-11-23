# Password password manager

A magic-key identity and animated treasure chest welcome you to your vault. The key turns and the chest opens only after successful cryptographic authentication (or successful creation of a new vault). Incorrect passwords leave the chest closed. Reduced-motion preferences are respected. Existing Citadel vaults and backups remain compatible.

A local password manager for a computer security and cryptography unit. Requires Node.js 18 or newer, with no dependencies to install.

## Run

Run `npm start`, then open http://localhost:3000. Create a unique master passphrase of at least 12 characters. Add, edit, search, favorite, copy, and delete credentials. The generator creates random passwords of 12–64 characters. Export encrypted backups regularly. Import replaces the current vault and requires the backup's master password.

Run `npm run check` and `npm test` for validation.

## Hosting on Netlify

Connect this GitHub repository to Netlify. The included configuration runs `npm run build` and publishes `dist`. Every push to the production branch rebuilds the website from the current source files. For manual uploads, run `npm run build` and upload `dist` to your existing site's deploy page. Hosted vaults stay in each visitor's browser; there is no shared database or automatic vault sync. Export and import an encrypted backup to move an existing vault to another origin.

## Cryptographic design

- PBKDF2-HMAC-SHA-256, 600,000 iterations, and a random 16-byte salt derive a non-extractable AES-256 key from the master password.
- AES-256-GCM encrypts and authenticates the entire vault, including account names, websites, usernames, passwords, and notes. A fresh random 12-byte nonce is generated on every save; Web Crypto uses a 128-bit authentication tag by default.
- Only the version, fixed KDF work factor, salt, nonce, and ciphertext are stored in localStorage or exported. The master password and plaintext vault are never intentionally persisted.
- Cryptographically secure random generation uses rejection sampling to avoid modulo bias and requires at least one character from every selected class.
- The vault locks after five minutes without interaction. Locking drops application references to the key and clears rendered records and forms. JavaScript cannot guarantee physical memory erasure.
- The local server supplies a restrictive Content Security Policy, MIME sniffing protection, and no-cache responses. It listens only on loopback. Remote hosting requires HTTPS.

## Course connections

Classical ciphers are unsuitable for modern password storage. Symmetric encryption protects secrets here; hashing supports the KDF rather than replacing reversible encryption. A password manager must recover a saved password, while a login server normally stores a salted password hash. Public-key encryption, PKI, and key exchange become relevant for secure synchronization and TLS, and are not added unnecessarily to a single-device vault. AES-256 offers a strong symmetric margin against quantum search; this app does not implement a PQC key exchange. Network and web security are addressed through local-only operation, secure-context Web Crypto, text-only DOM rendering, and restrictive response headers.

## Limits and threat model

This is an educational project, not an audited commercial password manager. It protects a copied database or encrypted backup against someone who lacks a strong master password. It does not protect an unlocked vault against malware, malicious browser extensions, compromised scripts, OS-level attackers, or clipboard monitoring. Strength ratings are heuristics, not leaked-password checks. There is no recovery, sync, multi-user support, or breach lookup. Browser storage can be cleared or evicted. Export backups and retain the master password safely. Imports structurally validate the encrypted envelope; cryptographic authentication occurs on unlock. A damaged or incorrectly encrypted backup cannot be unlocked. Use a separate browser profile or origin for this app.
