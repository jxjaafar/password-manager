(function (root) {
  class AccountGate {
    constructor(storage, onAuthenticated, onSignOut) {
      this.storage = storage; this.register = false; this.busy = false;
      this.dialog = document.createElement('dialog'); this.dialog.id = 'accountDialog';
      this.dialog.innerHTML = `<form><div class="eyebrow">ONE ACCOUNT. YOUR VAULT, EVERYWHERE.</div><h2>Sign in to Password</h2><p class="account-help">Sign in to find your saved vault, then unlock it with your master password.</p><label>Email<input name="email" type="email" autocomplete="username" maxlength="254" required></label><label>Account password<input name="password" type="password" minlength="12" maxlength="256" autocomplete="current-password" required></label><label class="account-confirm hidden">Confirm account password<input name="confirm" type="password" maxlength="256" autocomplete="new-password"></label><p class="fine-print">Use a different password from your vault master password. The master password is never sent to the server. There is no password reset yet—keep both passwords safe.</p><p class="error" role="alert"></p><button class="primary wide" type="submit">Sign in</button><button class="text-button account-toggle" type="button">New here? Create an account</button></form>`;
      document.body.append(this.dialog);
      this.dialog.addEventListener('cancel', event => event.preventDefault());
      const form = this.dialog.querySelector('form'), submit = form.querySelector('[type=submit]'), toggle = form.querySelector('.account-toggle');
      toggle.onclick = () => {
        this.register = !this.register; form.querySelector('.error').textContent = '';
        form.querySelector('h2').textContent = this.register ? 'Create your account' : 'Sign in to Password';
        form.querySelector('.account-help').textContent = this.register ? 'Register once. If this browser has an existing unclaimed MySQL vault, it will be linked to your account.' : 'Sign in to find your saved vault, then unlock it with your master password.';
        form.querySelector('.account-confirm').classList.toggle('hidden', !this.register);
        form.elements.confirm.required = this.register; form.elements.password.autocomplete = this.register ? 'new-password' : 'current-password';
        submit.textContent = this.register ? 'Create account' : 'Sign in';
        toggle.textContent = this.register ? 'Already registered? Sign in' : 'New here? Create an account';
      };
      form.onsubmit = async event => {
        event.preventDefault(); if (this.busy) return;
        const error = form.querySelector('.error'); error.textContent = '';
        if (this.register && form.elements.password.value !== form.elements.confirm.value) { error.textContent = 'Account passwords do not match.'; return; }
        this.busy = true; submit.disabled = true; toggle.disabled = true;
        try {
          await storage.authenticate(form.elements.email.value.trim(), form.elements.password.value, this.register);
          form.reset(); this.dialog.close(); await onAuthenticated();
        } catch (problem) { error.textContent = problem.message; }
        finally { this.busy = false; submit.disabled = false; toggle.disabled = false; }
      };
      this.identity = document.createElement('span'); this.identity.className = 'account-identity';
      this.signOut = document.createElement('button'); this.signOut.className = 'secondary hidden'; this.signOut.textContent = 'Sign out';
      this.signOut.onclick = onSignOut;
      document.querySelector('.header-right').prepend(this.identity, this.signOut);
    }
    show() { this.identity.textContent = ''; this.signOut.classList.add('hidden'); if (!this.dialog.open) this.dialog.showModal(); }
    update() { this.identity.textContent = this.storage.email || ''; this.signOut.classList.toggle('hidden', !this.storage.email); }
  }
  root.AccountGate = AccountGate;
})(globalThis);
