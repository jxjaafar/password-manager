const $ = id => document.getElementById(id);
function initializeBrand() {
document.title = 'Password — A little magic. A safer vault.';
const magicKey = `<svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M27 37 12 52v8h9v-7h7v-7l7-7" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><circle cx="39" cy="25" r="15" stroke="currentColor" stroke-width="4"/><path d="m39 16 2.5 6.5L48 25l-6.5 2.5L39 34l-2.5-6.5L30 25l6.5-2.5L39 16ZM15 4l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5ZM56 39l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5 1.5-4Z" fill="currentColor"/></svg>`;
document.querySelector('.brand').innerHTML = `<span class="brand-key">${magicKey}</span><span>password<span class="dot">.</span></span>`;
document.querySelector('.dialog-logo').outerHTML = `<div class="treasure-scene" aria-hidden="true"><div class="treasure-halo"></div><span class="spark spark-one">✦</span><span class="spark spark-two">✧</span><span class="spark spark-three">✦</span><div class="chest"><div class="chest-light"></div><div class="chest-lid"><i></i></div><div class="chest-body"><i></i><span class="chest-lock">⌕</span></div></div><div class="flying-key">${magicKey}</div><div class="scene-caption">A LITTLE MAGIC. ONLY YOUR KEY.</div></div>`;
}
const STORAGE = 'citadel.vault.v1';
let storage = null;
let accountGate = null;
const ITERATIONS = 600000;
let key = null, vault = [], envelope = null, filter = 'all', idleTimer, toastTimer;
const encoder = new TextEncoder();
const b64 = bytes => { let text = ''; for (const byte of new Uint8Array(bytes)) text += String.fromCharCode(byte); return btoa(text); };
const unb64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
function notify(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3000); }
function validateEnvelope(data) {
  if (!data || data.version !== 1 || data.iterations !== ITERATIONS || typeof data.salt !== 'string' || typeof data.iv !== 'string' || typeof data.data !== 'string' || data.data.length > 12000000 || unb64(data.salt).length !== 16 || unb64(data.iv).length !== 12 || unb64(data.data).length < 16) throw new Error('Invalid vault file');
  return data;
}
async function derive(password, salt) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function persist(nextVault = vault) {
  // Work on a clone so failed encryption/storage writes cannot corrupt the live state.
  const startingKey = key;
  if (!startingKey) throw new Error('Vault is locked');
  const chain = Keychain.loadFromLive(startingKey);
  for (const old of vault) if (!nextVault.some(item => item.id === old.id)) await chain.remove(old.id);
  const metadata = [];
  for (const item of nextVault) {
    const { password, ...record } = item;
    if (password !== undefined) {
      await chain.set(item.id, password);
      record.rating = strength(password) === 'Strong' ? 2 : strength(password) === 'Fair' ? 1 : 0;
      await chain.setMetadata(item.id, record);
    }
    metadata.push(record);
  }
  const [representation] = await chain.dump();
  if (key !== startingKey) throw new Error('Vault locked or changed while saving. Unlock and try again.');
  if (storage) await storage.save(representation);
  else localStorage.setItem(STORAGE, representation);
  if (key !== startingKey) throw new Error('Vault locked during save. Unlock to reload the saved data.');
  key = chain; envelope = JSON.parse(representation); vault = metadata;
}
function strength(password) { return password.length >= 16 && new Set(password).size >= 8 ? 'Strong' : password.length >= 12 && new Set(password).size >= 6 ? 'Fair' : 'Weak'; }
function randomIndex(max) { const bytes = new Uint32Array(1), limit = 4294967296 - 4294967296 % max; do { crypto.getRandomValues(bytes); } while (bytes[0] >= limit); return bytes[0] % max; }
function generate(length = Number($('length').value)) {
  const groups = ['abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
  if ($('useNumbers').checked) groups.push('0123456789');
  if ($('useSymbols').checked) groups.push('!@#$%^&*()-_=+[]{}:,.?');
  const alphabet = groups.join('');
  // Rejection of whole candidates preserves a uniform distribution among valid passwords.
  let result;
  do { result = Array.from({ length }, () => alphabet[randomIndex(alphabet.length)]).join(''); } while (!groups.every(group => [...result].some(c => group.includes(c))));
  return result;
}
async function copy(text) { try { await navigator.clipboard.writeText(text); notify('Copied to clipboard. Clear it after use.'); } catch { notify('Clipboard access unavailable. Open the entry to view it.'); } }
function element(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }
function render() {
  $('navCount').textContent = vault.length;
  $('totalStat').textContent = vault.length;
  $('strongStat').textContent = vault.filter(item => item.rating === 2).length;
  $('weakStat').textContent = vault.filter(item => item.rating !== 2).length;
  const query = $('search').value.toLowerCase();
  const items = vault.filter(item => (filter !== 'favorites' || item.favorite) && [item.name, item.username, item.url].some(value => value.toLowerCase().includes(query))).sort((a, b) => a.name.localeCompare(b.name));
  $('entries').replaceChildren();
  for (const item of items) {
    const row = element('div', 'entry-row');
    row.tabIndex = 0; row.setAttribute('role', 'button'); row.setAttribute('aria-label', `Edit ${item.name}`);
    const account = element('div', 'account'), title = element('div');
    account.append(element('span', 'account-icon', item.name.slice(0, 1).toUpperCase()));
    title.append(element('strong', '', `${item.name}${item.favorite ? ' ☆' : ''}`));
    title.append(element('small', '', item.url || 'Personal account')); account.append(title);
    const rating = ['Weak', 'Fair', 'Strong'][item.rating] || 'Weak', actions = element('div', 'row-actions');
    const copyBtn = element('button', 'icon-button', '⧉'); copyBtn.title = 'Copy password'; copyBtn.setAttribute('aria-label', `Copy password for ${item.name}`);
    copyBtn.onclick = async event => { event.stopPropagation(); try { const password = await key.get(item.id); if (key && password !== null) await copy(password); } catch { notify('Could not authenticate this password.'); } };
    actions.append(copyBtn, element('span', 'icon-button', '›'));
    row.append(account, element('span', 'username', item.username || '—'), element('span', `strength ${rating === 'Strong' ? '' : 'weak'}`, `● ${rating}`), actions);
    row.onclick = () => openEntry(item); row.onkeydown = event => { if (event.target === row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openEntry(item); } };
    $('entries').append(row);
  }
  if (!items.length) {
    const empty = element('div', 'empty'); empty.append(element('div', 'empty-icon', '◈'), element('h2', '', query ? 'No matches found.' : filter === 'favorites' ? 'Keep your essentials close.' : 'A fresh start for your secrets.'), element('p', '', query ? 'Try another account name, username, or website.' : filter === 'favorites' ? 'Star a password to find it here.' : 'Add your first password. We’ll keep it encrypted and ready when you need it.'));
    if (!query && filter === 'all') { const button = element('button', 'primary', '＋ Add your first password'); button.onclick = () => openEntry(); empty.append(button); }
    $('entries').append(empty);
  }
  $('resultCount').textContent = `${items.length} ${items.length === 1 ? 'password' : 'passwords'} in view`;
}
function showView(view) {
  for (const id of ['vaultView', 'generatorView', 'securityView']) $(id).classList.toggle('hidden', id !== view);
  for (const id of ['allNav', 'favoritesNav', 'generatorNav', 'securityNav']) $(id).classList.remove('selected');
  const nav = view === 'generatorView' ? 'generatorNav' : view === 'securityView' ? 'securityNav' : filter === 'favorites' ? 'favoritesNav' : 'allNav';
  $(nav).classList.add('selected'); $('breadcrumb').textContent = $(nav).querySelector('span').textContent;
  $('addBtn').classList.toggle('hidden', view !== 'vaultView');
  if (view === 'generatorView') $('generatedPassword').textContent = generate();
  render();
}
async function openEntry(item) {
  const currentKey = key;
  if (!currentKey) return;
  let password = '';
  try { if (item) password = await currentKey.get(item.id); } catch { notify('Could not authenticate this password.'); return; }
  if (key !== currentKey) return;
  $('entryForm').reset(); $('entryError').textContent = ''; $('entryId').value = item?.id || '';
  for (const [field, property] of [['entryName', 'name'], ['entryUrl', 'url'], ['entryUsername', 'username'], ['entryPassword', 'password'], ['entryNotes', 'notes']]) $(field).value = item?.[property] || '';
  $('entryFavorite').checked = Boolean(item?.favorite); $('entryPassword').type = 'password';
  $('entryPassword').value = password;
  $('entryTitle').textContent = item ? 'Edit password' : 'Add a password'; $('deleteBtn').classList.toggle('hidden', !item); $('entryDialog').showModal();
}
function resetIdle() { clearTimeout(idleTimer); if (key) idleTimer = setTimeout(lock, 5 * 60 * 1000); }
function lock() {
  key = null; vault = []; clearTimeout(idleTimer); $('entryDialog').close(); $('entryForm').reset(); $('generatedPassword').textContent = ''; $('search').value = ''; render(); configureAuth();
}
function configureAuth() {
  $('authDialog').classList.remove('unlocking', 'denied');
  $('authForm').reset(); $('masterPassword').type = 'password'; $('authError').textContent = '';
  const exists = Boolean(storage ? storage.read() : localStorage.getItem(STORAGE));
  $('authTitle').textContent = exists ? 'Your key to everything.' : 'Welcome to Password.';
  $('authDescription').textContent = exists ? 'Enter your master password to unlock your private vault.' : 'Create a master password to start your encrypted vault.';
  $('confirmLabel').classList.toggle('hidden', exists); $('confirmPassword').required = !exists;
  $('masterPassword').minLength = exists ? 1 : 12; $('masterPassword').autocomplete = exists ? 'current-password' : 'new-password';
  $('authSubmit').textContent = exists ? 'Unlock vault →' : 'Create vault →';
  if (!$('authDialog').open) $('authDialog').showModal();
}
$('authDialog').addEventListener('cancel', event => event.preventDefault());
$('authForm').onsubmit = async event => {
  event.preventDefault(); $('authError').textContent = ''; $('authSubmit').disabled = true;
  try {
    if (!crypto.subtle) throw new Error('Use localhost or HTTPS to enable secure cryptography.');
    const stored = storage ? storage.read() : localStorage.getItem(STORAGE), password = $('masterPassword').value;
    if (!stored && password !== $('confirmPassword').value) throw new Error('The master passwords do not match.');
    const trusted = $('trustedChecksum').value.trim() || undefined;
    const parsed = stored ? JSON.parse(stored) : null;
    if (parsed?.version === 1) {
      if (trusted) throw new Error('Trusted checksums are supported for version 2 vaults only.');
      validateEnvelope(parsed);
      const legacyKey = await derive(password, unb64(parsed.salt));
      let records;
      try { records = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(parsed.iv) }, legacyKey, unb64(parsed.data)))); }
      catch { throw new Error('Could not unlock the legacy vault. Check your master password.'); }
      if (!Array.isArray(records) || records.some(item => !item || ['id', 'name', 'username', 'url', 'password', 'notes'].some(field => typeof item[field] !== 'string'))) throw new Error('Invalid legacy records.');
      if (records.some(item => [...item.password].length > 64)) throw new Error('Legacy vault has a password longer than the assignment’s 64-character limit. Use the previous app version to export and shorten it before migration. Your saved vault has not changed.');
      key = await Keychain.init(password); vault = [];
      await persist(records);
      notify('Vault upgraded to individually encrypted records.');
    } else {
      key = stored ? await Keychain.load(password, stored, trusted) : await Keychain.init(password);
      vault = await key.entries();
      if (!stored) await persist();
      else if (storage?.isDatabase && storage.representation === null) await storage.save(stored);
    }
    $('authForm').reset();
    $('authTitle').textContent = 'Your treasures await.';
    $('authDescription').textContent = 'The right key. A little magic. Welcome to your vault.';
    const unlockedKey = key;
    $('authDialog').classList.add('unlocking');
    await new Promise(resolve => setTimeout(resolve, matchMedia('(prefers-reduced-motion: reduce)').matches ? 150 : 1650));
    if (key !== unlockedKey) return;
    $('authDialog').close(); $('authDialog').classList.remove('unlocking'); showView('vaultView'); resetIdle();
  } catch (error) { key = null; vault = []; $('authError').textContent = error.message; $('authDialog').classList.remove('denied'); void $('authDialog').offsetWidth; $('authDialog').classList.add('denied'); }
  finally { $('authSubmit').disabled = false; }
};
$('entryForm').onsubmit = async event => {
  event.preventDefault(); if (!key) return; $('saveBtn').disabled = true; $('entryError').textContent = '';
  try {
    const name = $('entryName').value.trim(); if (!name) throw new Error('Enter an account name.');
    const url = $('entryUrl').value.trim(); if (url && !['https:', 'http:'].includes(new URL(url).protocol)) throw new Error('Use an HTTP or HTTPS website address.');
    const item = { id: $('entryId').value || crypto.randomUUID(), name, url, username: $('entryUsername').value.trim(), password: $('entryPassword').value, notes: $('entryNotes').value, favorite: $('entryFavorite').checked };
    const next = [...vault.filter(entry => entry.id !== item.id), item]; await persist(next); $('entryDialog').close(); $('entryForm').reset(); render(); notify('Password saved securely.');
  } catch (error) { $('entryError').textContent = error.message; }
  finally { $('saveBtn').disabled = false; }
};
$('deleteBtn').onclick = async () => {
  if (!key || !confirm('Permanently delete this password from your vault?')) return;
  try { await persist(vault.filter(item => item.id !== $('entryId').value)); $('entryDialog').close(); $('entryForm').reset(); render(); notify('Password deleted.'); } catch { $('entryError').textContent = 'Could not save the vault. Please try again.'; }
};
$('exportBtn').onclick = async () => {
  if (!key) return;
  const [representation, trustedChecksum] = await key.dump();
  const blob = new Blob([representation], { type: 'application/json' }), url = URL.createObjectURL(blob), anchor = element('a');
  anchor.href = url; anchor.download = `password-backup-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Encrypted backup downloaded. Keep your master password.');
  prompt('Save this SHA-256 checksum separately in trusted storage. Enter it at unlock to detect rollback or modification of this exact backup. Refresh it after every change; keeping it with the backup is not rollback protection.', trustedChecksum);
};
$('importBtn').onclick = () => { $('importFile').value = ''; $('importFile').click(); };
function importCredentials() {
  return new Promise(resolve => {
    const dialog = element('dialog'), form = element('form'), heading = element('h2', '', 'Authenticate your backup');
    const passwordLabel = element('label', '', 'Backup master password'), password = element('input'); password.type = 'password'; password.required = true; password.autocomplete = 'current-password'; passwordLabel.append(password);
    const hashLabel = element('label', '', 'Trusted SHA-256 checksum (optional)'), hash = element('input'); hashLabel.append(hash);
    const submit = element('button', 'primary', 'Verify and import'); submit.type = 'submit';
    const cancel = element('button', 'secondary', 'Cancel'); cancel.type = 'button';
    const finish = value => { dialog.close(); form.reset(); dialog.remove(); resolve(value); };
    cancel.onclick = () => finish(null); dialog.oncancel = event => { event.preventDefault(); finish(null); };
    form.onsubmit = event => { event.preventDefault(); finish({ password: password.value, trusted: hash.value.trim() || undefined }); };
    form.append(heading, passwordLabel, hashLabel, element('p', '', 'The current vault is replaced only after the backup passes authentication.'), cancel, submit); dialog.append(form); document.body.append(dialog); dialog.showModal();
  });
}
$('importFile').onchange = async () => {
  const file = $('importFile').files[0]; if (!file) return;
  try {
    if (file.size > 12000000) throw new Error('Backup is too large.');
    const representation = await file.text(), imported = JSON.parse(representation);
    if (imported.version === 1) validateEnvelope(imported);
    else if (imported.version !== 2 || !imported.kvs) throw new Error('Invalid backup');
    if (!confirm('Replace this vault with the encrypted backup? Export your current vault first. You will need the backup’s master password.')) return;
    const credentials = await importCredentials();
    if (!credentials) return;
    const { password, trusted } = credentials;
    if (imported.version === 2) {
      await Keychain.load(password, representation, trusted);
    } else {
      if (trusted) throw new Error('Legacy vaults do not support trusted checksums');
      const legacyKey = await derive(password, unb64(imported.salt));
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(imported.iv) }, legacyKey, unb64(imported.data));
    }
    await storage.save(representation); lock(); notify('Backup authenticated and imported. Unlock with its master password.');
  } catch { notify('Import failed. Select a valid Password encrypted backup.'); }
};
$('allNav').onclick = () => { filter = 'all'; showView('vaultView'); };
$('favoritesNav').onclick = () => { filter = 'favorites'; showView('vaultView'); };
$('generatorNav').onclick = () => showView('generatorView'); $('securityNav').onclick = () => showView('securityView');
$('search').oninput = render; $('addBtn').onclick = () => openEntry(); $('closeEntry').onclick = () => { $('entryDialog').close(); $('entryForm').reset(); };
$('lockBtn').onclick = lock;
$('toggleMaster').onclick = () => { $('masterPassword').type = $('masterPassword').type === 'password' ? 'text' : 'password'; };
$('toggleEntry').onclick = () => { $('entryPassword').type = $('entryPassword').type === 'password' ? 'text' : 'password'; };
$('fillGenerated').onclick = () => { $('entryPassword').value = generate(20); notify('Generated a fresh 20-character password.'); };
$('generateBtn').onclick = () => { $('generatedPassword').textContent = generate(); };
$('length').oninput = () => { $('lengthValue').textContent = $('length').value; $('generatedPassword').textContent = generate(); };
$('copyGenerated').onclick = () => copy($('generatedPassword').textContent);
for (const event of ['pointerdown', 'keydown', 'input']) document.addEventListener(event, resetIdle, { passive: true });
window.addEventListener('storage', event => { if (storage?.mode === 'local' && event.key === STORAGE && key) { lock(); notify('Vault changed in another tab. Unlock again.'); } });
initializeBrand();
const trustedLabel = element('label', '', 'Trusted SHA-256 checksum (optional)');
const trustedInput = element('input'); trustedInput.id = 'trustedChecksum'; trustedInput.autocomplete = 'off'; trustedInput.placeholder = 'From your separate trusted storage'; trustedLabel.append(trustedInput);
$('authSubmit').before(trustedLabel);
const restoreBackup = element('button', 'text-button', 'Restore an existing encrypted backup');
restoreBackup.type = 'button'; restoreBackup.onclick = () => $('importBtn').click(); $('authSubmit').after(restoreBackup);
$('entryPassword').maxLength = 128;
async function initializeStorage() {
  render(); $('authSubmit').disabled = true; $('authDialog').showModal();
  try {
    storage = new VaultStorage(STORAGE); await storage.initialize();
    accountGate = new AccountGate(storage, async () => {
      accountGate.update(); configureAuth(); $('authSubmit').disabled = false;
    }, async () => {
      lock(); $('authSubmit').disabled = true;
      try { await storage.logout(); accountGate.show(); }
      catch (error) { $('authError').textContent = error.message; $('authSubmit').disabled = false; }
    });
    const databaseName = storage.mode === 'sqlite' ? 'SQLite' : 'MySQL';
    document.querySelector('.local').textContent = storage.isDatabase ? `● ${databaseName.toUpperCase()} CONNECTED` : '● BROWSER STORAGE';
    document.querySelector('.secure-badge').textContent = storage.isDatabase ? `● Encrypted vault in ${databaseName}` : '● Encrypted in this browser';
    if (storage.requiresAccount) { $('authTitle').textContent = 'Sign in to find your vault.'; accountGate.show(); }
    else { accountGate.update(); configureAuth(); $('authSubmit').disabled = false; }
  } catch (error) { $('authError').textContent = error.message; }
}
initializeStorage().catch(error => { $('authError').textContent = error.message; });
window.addEventListener('account-session-expired', () => { lock(); $('authSubmit').disabled = true; accountGate?.show(); });
