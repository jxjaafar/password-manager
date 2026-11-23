(function (root) {
  class AccountGate {
    constructor(storage, onAuthenticated, onSignOut) {
      this.storage = storage; this.register = false; this.busy = false;
      this.dialog = document.createElement('dialog'); this.dialog.id = 'accountDialog';
      this.dialog.innerHTML = `<form><div class="eyebrow">ONE ACCOUNT. YOUR KEY SAFE.</div><h2>Sign in to Password</h2><p class="account-help">Sign in to open your saved passwords.</p><label>Email<input name="email" type="email" autocomplete="username" maxlength="254" required></label><label>Password<input name="password" type="password" minlength="12" maxlength="256" autocomplete="current-password" required></label><label class="account-confirm hidden">Confirm password<input name="confirm" type="password" maxlength="256" autocomplete="new-password"></label><label class="legacy-option"><span><input name="legacy" type="checkbox"> Existing account with two passwords</span></label><label class="legacy-master hidden">Existing Key Safe password<input name="master" type="password" autocomplete="off"></label><p class="fine-print">Your password opens your Key Safe on this device. A separate derived sign-in credential is sent to the server. There is no password reset; keep your password safe.</p><p class="error" role="alert"></p><button class="primary wide" type="submit">Sign in</button><button class="text-button account-toggle" type="button">New here? Create an account</button></form>`;
      document.body.append(this.dialog);
      this.dialog.addEventListener('cancel', event => event.preventDefault());
      const form = this.dialog.querySelector('form'), submit = form.querySelector('[type=submit]'), toggle = form.querySelector('.account-toggle');
      toggle.onclick = () => {
        this.register = !this.register; form.querySelector('.error').textContent = '';
        form.querySelector('h2').textContent = this.register ? 'Create your account' : 'Sign in to Password';
        form.querySelector('.account-help').textContent = this.register ? 'Create an account. Your encrypted Key Safe is set up automatically.' : 'Sign in to open your saved passwords.';
        form.querySelector('.account-confirm').classList.toggle('hidden', !this.register);
        form.querySelector('.legacy-option').classList.toggle('hidden', this.register);
        form.elements.legacy.checked = false; form.elements.master.required = false; form.querySelector('.legacy-master').classList.add('hidden');
        form.elements.confirm.required = this.register; form.elements.password.autocomplete = this.register ? 'new-password' : 'current-password';
        submit.textContent = this.register ? 'Create account' : 'Sign in';
        toggle.textContent = this.register ? 'Already registered? Sign in' : 'New here? Create an account';
      };
      form.elements.legacy.onchange = () => { form.querySelector('.legacy-master').classList.toggle('hidden', !form.elements.legacy.checked); form.elements.master.required = form.elements.legacy.checked; };
      form.onsubmit = async event => {
        event.preventDefault(); if (this.busy) return;
        const error = form.querySelector('.error'); error.textContent = '';
        if (this.register && form.elements.password.value !== form.elements.confirm.value) { error.textContent = 'Passwords do not match.'; return; }
        this.busy = true; submit.disabled = true; toggle.disabled = true;
        try {
          const email = form.elements.email.value.trim().toLowerCase();
          const password = form.elements.password.value;
          const legacy = form.elements.legacy.checked;
          const secret = legacy ? form.elements.master.value : password;
          if (!secret) throw new Error('Enter your Key Safe password.');
          const credential = legacy ? password : await root.deriveSignInCredential(email, password);
          if (storage.email !== email) await storage.authenticate(email, credential, this.register);
          this.dialog.close();
          await onAuthenticated(secret);
          form.reset(); this.dialog.close();
        } catch (problem) { document.getElementById('authDialog').close(); if (!this.dialog.open) this.dialog.showModal(); error.textContent = problem.message.replace(/vault/gi, 'Key Safe'); }
        finally { this.busy = false; submit.disabled = false; toggle.disabled = false; }
      };
      this.identity = document.createElement('span'); this.identity.className = 'account-identity';
      this.signOut = document.createElement('button'); this.signOut.className = 'secondary hidden'; this.signOut.textContent = 'Sign out';
      this.signOut.onclick = onSignOut;
      document.querySelector('.header-right').prepend(this.identity, this.signOut);
      this.switchAccount = document.createElement('button');
      this.switchAccount.type = 'button'; this.switchAccount.className = 'secondary wide hidden';
      this.switchAccount.textContent = 'Sign out / Switch account';
      this.switchAccount.onclick = async () => {
        this.switchAccount.disabled = true;
        try { await onSignOut(); }
        finally { this.switchAccount.disabled = false; }
      };
      document.getElementById('authForm').append(this.switchAccount);
    }
    show() {
      document.getElementById('authDialog').close(); this.identity.textContent = '';
      this.signOut.classList.add('hidden'); this.switchAccount.classList.add('hidden');
      const form = this.dialog.querySelector('form');
      form.reset(); form.querySelector('.error').textContent = '';
      if (this.register) form.querySelector('.account-toggle').click();
      form.querySelector('.legacy-master').classList.add('hidden'); form.elements.master.required = false;
      if (!this.dialog.open) this.dialog.showModal();
    }
    update() {
      this.identity.textContent = this.storage.email || '';
      this.signOut.classList.toggle('hidden', !this.storage.email);
      this.switchAccount.classList.toggle('hidden', !this.storage.email);
    }
  }
  root.AccountGate = AccountGate;
  root.deriveSignInCredential = async (email, password) => {
    const encode = new TextEncoder();
    const material = await crypto.subtle.importKey('raw', encode.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: 600000, salt: encode.encode('Password/account-auth/v1/' + email.trim().toLowerCase()) }, material, 256);
    return 'account-v1:' + Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, '0')).join('');
  };
})(globalThis);
