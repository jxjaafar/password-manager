/* Browser storage adapter. MySQL is authoritative when the local backend enables it. */
(function (root) {
  class VaultStorage {
    constructor(localKey) { this.localKey = localKey; this.mode = 'loading'; this.revision = 0; this.representation = null; this.requiresAccount = false; this.email = null; }
    get isDatabase() { return this.mode === 'mysql' || this.mode === 'sqlite'; }
    async initialize() {
      const response = await fetch('/api/vault', { cache: 'no-store', credentials: 'same-origin' });
      if (response.status === 401) { const data = await response.json(); this.mode = data.mode === 'sqlite' ? 'sqlite' : 'mysql'; this.requiresAccount = true; this.email = null; this.representation = null; this.revision = 0; return; }
      if (response.status === 404) throw new Error('Hosted API is unavailable. Deploy the Netlify Function before opening the Key Safe.');
      if (!response.ok) throw new Error('Could not connect to Key Safe storage. Reload to try again.');
      const data = await response.json();
      if (data.mode === 'local') { this.mode = 'local'; return; }
      if (!['mysql', 'sqlite'].includes(data.mode) || !Number.isSafeInteger(data.revision)) throw new Error('Invalid storage response');
      this.mode = data.mode; this.revision = data.revision; this.representation = data.representation; this.requiresAccount = false; this.email = data.email;
    }
    read() {
      if (this.mode === 'loading') throw new Error('Key Safe storage is not ready');
      if (this.isDatabase) return this.representation;
      // Local-only data is never silently attached to a different signed-in account.
      return localStorage.getItem(this.localKey);
    }
    async authenticate(email, password, register = false) {
      const response = await fetch(`/api/auth/${register ? 'register' : 'login'}`, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Sign-in failed');
      await this.initialize();
      if (this.requiresAccount) throw new Error('Session cookie could not be saved. Allow cookies for this site.');
    }
    async logout() {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!response.ok) throw new Error('Could not sign out. Try again.');
      this.requiresAccount = true; this.email = null; this.representation = null; this.revision = 0;
    }
    async save(representation) {
      if (this.isDatabase) {
        const response = await fetch('/api/vault', {
          method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ representation, revision: this.revision })
        });
        const result = await response.json();
        if (response.status === 401) { this.requiresAccount = true; root.dispatchEvent(new Event('account-session-expired')); }
        if (!response.ok) throw new Error(result.error || 'Database save failed');
        this.representation = representation; this.revision = result.revision;
      } else if (this.mode === 'local') localStorage.setItem(this.localKey, representation);
      else throw new Error('Storage is not ready');
    }
  }
  root.VaultStorage = VaultStorage;
})(globalThis);
