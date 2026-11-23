/* Browser storage adapter. MySQL is authoritative when the local backend enables it. */
(function (root) {
  class VaultStorage {
    constructor(localKey) { this.localKey = localKey; this.mode = 'loading'; this.revision = 0; this.representation = null; }
    async initialize() {
      const response = await fetch('/api/vault', { cache: 'no-store', credentials: 'same-origin' });
      // A static host has no API. Other failures must not silently downgrade storage.
      if (response.status === 404) { this.mode = 'local'; return; }
      if (!response.ok) throw new Error('Could not connect to vault storage. Reload to try again.');
      const data = await response.json();
      if (data.mode === 'local') { this.mode = 'local'; return; }
      if (data.mode !== 'mysql' || !Number.isSafeInteger(data.revision)) throw new Error('Invalid storage response');
      this.mode = 'mysql'; this.revision = data.revision; this.representation = data.representation;
    }
    read() {
      if (this.mode === 'loading') throw new Error('Vault storage is not ready');
      if (this.mode === 'mysql' && this.representation !== null) return this.representation;
      // Preserve existing browser vaults. They move to MySQL only after successful unlock.
      return localStorage.getItem(this.localKey);
    }
    async save(representation) {
      if (this.mode === 'mysql') {
        const response = await fetch('/api/vault', {
          method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ representation, revision: this.revision })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'MySQL save failed');
        this.representation = representation; this.revision = result.revision;
      } else if (this.mode === 'local') localStorage.setItem(this.localKey, representation);
      else throw new Error('Storage is not ready');
    }
  }
  root.VaultStorage = VaultStorage;
})(globalThis);
