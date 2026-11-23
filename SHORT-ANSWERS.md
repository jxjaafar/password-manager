# Project 1 short-answer explanations

These explain [password-manager.js](./password-manager.js). Review and understand them before submitting the short-answer component separately.

## 1. Hiding password lengths

Each password is encoded into a fixed 258-byte plaintext: two bytes for its UTF-8 byte length, followed by up to 256 bytes of password data and zero padding. This supports at most 64 Unicode code points. The length is itself encrypted. AES-GCM produces a 274-byte ciphertext including its fixed authentication tag, plus a separate 12-byte nonce. Different password lengths therefore have the same serialized record size. Record count remains visible, as allowed by the assignment.

## 2. Preventing swap attacks

The dictionary key is an HMAC of the domain under a dedicated indexing key. GCM additional authenticated data includes a password-record context and this HMAC index. Moving a ciphertext/nonce pair to another index causes verification to fail. The manager throws instead of returning another site's password. No trusted checksum is needed for this defense. Indexing and encryption use separately derived keys.

## 3. Trusted state for rollback protection

Some fresh trusted state beyond the attacker's control is necessary in this model. An older authentic database still has valid tags and a valid hash of itself. If the attacker can replace both the database and all reference values, the client cannot distinguish the old snapshot from legitimate current state. The trusted state need not be a flash drive or hash: a trusted remote service or hardware monotonic counter could work. Here it is the separately retained current SHA-256 checksum.

## 4. Randomized MAC lookup

A freshly generated randomized tag will not necessarily equal the stored tag. One general solution is to scan stored tags and verify each against the requested domain, using the secret MAC key and the randomness/nonce included in the tag. This costs O(n) verifications in the worst case rather than expected O(1) lookup. Adding an independent deterministic secret index could restore direct lookup, but would add another primitive instead of relying only on the randomized MAC.

## 5. Revealing only floor(log2(k))

For k > 0, pad the database to 2^(floor(log2(k)) + 1) slots. Every k in [2^j, 2^(j+1) - 1] then has the same 2^(j+1) visible slots. Fill spare slots with indistinguishable encrypted dummy records and random-looking indexes of the same sizes as real ones. Keep dummy indicators encrypted and give the client an authenticated way to recognize them. A public dummy marker would defeat the protection. Handle k = 0 separately because log2(0) is undefined. Hiding update/access patterns over time requires additional measures. This is a proposed extension, not part of the base implementation.

## 6. Sharing selected sites

Encrypt the selected site's record under its own random site key. Wrap that key separately for each authorized user's public encryption key. Alice and Bob can unwrap the shared site key and update its record without accessing unrelated private site keys. Authenticate updates, membership, and site identity, and use trusted version state to prevent replay and resolve conflicts. Revocation requires rotating the site key and rewrapping only for remaining members. A former member cannot be made to forget an already learned password: rotate the actual website password too. This is a protocol proposal, not an implemented multi-user feature.
