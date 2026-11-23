/* Standalone assignment submission. Works in Node (CommonJS) and browsers. */
(function (root) {
  'use strict';
  const cryptoAPI = typeof module !== 'undefined' && module.exports ? require('node:crypto').webcrypto : root.crypto;
  const subtle = cryptoAPI.subtle;
  const enc = new TextEncoder(), dec = new TextDecoder('utf-8', { fatal: true });
  const ITERATIONS = 600000, PADDED_BYTES = 258;
  const encode = buffer => {
    const bytes = new Uint8Array(buffer);
    let result = '';
    for (const byte of bytes) result += String.fromCharCode(byte);
    return btoa(result);
  };
  const decode = value => {
    if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('Invalid encoding');
    return Uint8Array.from(atob(value), c => c.charCodeAt(0));
  };
  const random = size => cryptoAPI.getRandomValues(new Uint8Array(size));
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const assertString = value => { if (typeof value !== 'string') throw new TypeError('Expected a string'); };
  async function keys(password, salt) {
    assertString(password);
    const raw = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    const master = await subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, raw, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']);
    const domain = await subtle.sign('HMAC', master, enc.encode('Password/keychain/v2/domain-index'));
    const encryption = await subtle.sign('HMAC', master, enc.encode('Password/keychain/v2/record-encryption'));
    return {
      domain: await subtle.importKey('raw', domain, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
      encryption: await subtle.importKey('raw', encryption, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
    };
  }
  async function checksum(text) { return encode(await subtle.digest('SHA-256', enc.encode(text))); }
  class Keychain {
    #keys; #salt; #check; #kvs; #metadata;
    constructor(derivedKeys, salt, check, kvs = Object.create(null), metadata = Object.create(null)) {
      this.#keys = derivedKeys; this.#salt = salt; this.#check = check; this.#kvs = kvs; this.#metadata = metadata;
    }
    static async init(password) {
      const salt = random(16), derivedKeys = await keys(password, salt);
      const chain = new Keychain(derivedKeys, encode(salt), null);
      chain.#check = await chain.#encrypt(enc.encode('Password keychain v2'), 'keychain-verifier/v2');
      return chain;
    }
    static loadFromLive(chain) {
      return new Keychain(chain.#keys, chain.#salt, chain.#check, Object.assign(Object.create(null), chain.#kvs), Object.assign(Object.create(null), chain.#metadata));
    }
    static async load(password, representation, trustedDataCheck) {
      assertString(representation);
      if (trustedDataCheck !== undefined && (typeof trustedDataCheck !== 'string' || await checksum(representation) !== trustedDataCheck)) throw new Error('Trusted checksum mismatch: possible rollback or modification');
      const data = JSON.parse(representation);
      if (!object(data) || data.version !== 2 || data.iterations !== ITERATIONS || decode(data.salt).length !== 16 || !object(data.kvs) || !object(data.metadata || {})) throw new Error('Invalid keychain format');
      const chain = new Keychain(await keys(password, decode(data.salt)), data.salt, data.check);
      if (dec.decode(await chain.#decrypt(data.check, 'keychain-verifier/v2')) !== 'Password keychain v2') throw new Error('Invalid password or keychain');
      // Read the actual serialized kvs; bind each ciphertext to its dictionary key.
      for (const [tag, record] of Object.entries(data.kvs)) {
        if (decode(tag).length !== 32) throw new Error('Invalid domain index');
        chain.#unpad(await chain.#decrypt(record, `password/v2/${tag}`, PADDED_BYTES + 16));
        chain.#kvs[tag] = record;
      }
      for (const [tag, record] of Object.entries(data.metadata || {})) {
        if (!Object.hasOwn(chain.#kvs, tag)) throw new Error('Orphan metadata');
        JSON.parse(dec.decode(await chain.#decrypt(record, `metadata/v2/${tag}`)));
        chain.#metadata[tag] = record;
      }
      return chain;
    }
    async #tag(name) { assertString(name); return encode(await subtle.sign('HMAC', this.#keys.domain, enc.encode(name))); }
    async #encrypt(bytes, context) {
      const iv = random(12);
      const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(context), tagLength: 128 }, this.#keys.encryption, bytes);
      return { iv: encode(iv), ciphertext: encode(ciphertext) };
    }
    async #decrypt(record, context, expectedLength) {
      if (!object(record)) throw new Error('Invalid encrypted record');
      const iv = decode(record.iv), ciphertext = decode(record.ciphertext);
      if (iv.length !== 12 || ciphertext.length < 16 || (expectedLength !== undefined && ciphertext.length !== expectedLength)) throw new Error('Invalid record length');
      try { return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(context), tagLength: 128 }, this.#keys.encryption, ciphertext)); }
      catch { throw new Error('Authentication failed: incorrect password, tampering, or swapped record'); }
    }
    #unpad(bytes) {
      if (bytes.length !== PADDED_BYTES) throw new Error('Invalid padded password');
      const length = (bytes[0] << 8) | bytes[1];
      if (length > 256 || bytes.slice(2 + length).some(value => value !== 0)) throw new Error('Invalid padding');
      const value = dec.decode(bytes.slice(2, 2 + length));
      if ([...value].length > 64) throw new Error('Invalid password length');
      return value;
    }
    async dump() {
      const representation = JSON.stringify({ version: 2, iterations: ITERATIONS, salt: this.#salt, check: this.#check, kvs: this.#kvs, metadata: this.#metadata });
      return [representation, await checksum(representation)];
    }
    async set(name, value) {
      assertString(value);
      if ([...value].length > 64 || enc.encode(value).length > 256) throw new Error('Passwords may contain at most 64 Unicode characters');
      const bytes = enc.encode(value), padded = new Uint8Array(PADDED_BYTES);
      padded[0] = bytes.length >> 8; padded[1] = bytes.length & 255; padded.set(bytes, 2);
      const tag = await this.#tag(name);
      this.#kvs[tag] = await this.#encrypt(padded, `password/v2/${tag}`);
    }
    async get(name) {
      const tag = await this.#tag(name);
      return Object.hasOwn(this.#kvs, tag) ? this.#unpad(await this.#decrypt(this.#kvs[tag], `password/v2/${tag}`, PADDED_BYTES + 16)) : null;
    }
    async remove(name) {
      const tag = await this.#tag(name);
      if (!Object.hasOwn(this.#kvs, tag)) return false;
      delete this.#kvs[tag]; delete this.#metadata[tag]; return true;
    }
    // Optional browser companion helpers; not needed by the assignment API.
    // Metadata is separately authenticated and cannot change password ciphertext lengths.
    async setMetadata(name, value) {
      const tag = await this.#tag(name);
      if (!Object.hasOwn(this.#kvs, tag)) throw new Error('Password record is missing');
      this.#metadata[tag] = await this.#encrypt(enc.encode(JSON.stringify(value)), `metadata/v2/${tag}`);
    }
    async entries() {
      const result = [];
      for (const [tag, record] of Object.entries(this.#metadata)) {
        result.push(JSON.parse(dec.decode(await this.#decrypt(record, `metadata/v2/${tag}`))));
      }
      return result;
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { Keychain };
  else root.Keychain = Keychain;
})(globalThis);
