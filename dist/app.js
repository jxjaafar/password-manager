const $ = id => document.getElementById(id);
function initializeBrand() {
document.title = 'Password — A little magic. A safer vault.';
const magicKey = `<svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M27 37 12 52v8h9v-7h7v-7l7-7" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><circle cx="39" cy="25" r="15" stroke="currentColor" stroke-width="4"/><path d="m39 16 2.5 6.5L48 25l-6.5 2.5L39 34l-2.5-6.5L30 25l6.5-2.5L39 16ZM15 4l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5ZM56 39l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5 1.5-4Z" fill="currentColor"/></svg>`;
document.querySelector('.brand').innerHTML = `<span class="brand-key">${magicKey}</span><span>password<span class="dot">.</span></span>`;
document.querySelector('.dialog-logo').outerHTML = `<div class="treasure-scene" aria-hidden="true"><div class="treasure-halo"></div><span class="spark spark-one">✦</span><span class="spark spark-two">✧</span><span class="spark spark-three">✦</span><div class="chest"><div class="chest-light"></div><div class="chest-lid"><i></i></div><div class="chest-body"><i></i><span class="chest-lock">⌕</span></div></div><div class="flying-key">${magicKey}</div><div class="scene-caption">A LITTLE MAGIC. ONLY YOUR KEY.</div></div>`;
}
const STORAGE = 'citadel.vault.v1';
const ITERATIONS = 600000;
let key = null, vault = [], envelope = null, filter = 'all', idleTimer, toastTimer;
const encoder = new TextEncoder();
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
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
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(nextVault)));
  const next = { version: 1, iterations: ITERATIONS, salt: envelope.salt, iv: b64(iv), data: b64(data) };
  localStorage.setItem(STORAGE, JSON.stringify(next));
  envelope = next; vault = nextVault;
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
  $('strongStat').textContent = vault.filter(item => strength(item.password) === 'Strong').length;
  $('weakStat').textContent = vault.filter(item => strength(item.password) !== 'Strong').length;
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
    const rating = strength(item.password), actions = element('div', 'row-actions');
    const copyBtn = element('button', 'icon-button', '⧉'); copyBtn.title = 'Copy password'; copyBtn.setAttribute('aria-label', `Copy password for ${item.name}`);
    copyBtn.onclick = event => { event.stopPropagation(); copy(item.password); };
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
function openEntry(item) {
  $('entryForm').reset(); $('entryError').textContent = ''; $('entryId').value = item?.id || '';
  for (const [field, property] of [['entryName', 'name'], ['entryUrl', 'url'], ['entryUsername', 'username'], ['entryPassword', 'password'], ['entryNotes', 'notes']]) $(field).value = item?.[property] || '';
  $('entryFavorite').checked = Boolean(item?.favorite); $('entryPassword').type = 'password';
  $('entryTitle').textContent = item ? 'Edit password' : 'Add a password'; $('deleteBtn').classList.toggle('hidden', !item); $('entryDialog').showModal();
}
function resetIdle() { clearTimeout(idleTimer); if (key) idleTimer = setTimeout(lock, 5 * 60 * 1000); }
function lock() {
  key = null; vault = []; clearTimeout(idleTimer); $('entryDialog').close(); $('entryForm').reset(); $('generatedPassword').textContent = ''; $('search').value = ''; render(); configureAuth();
}
function configureAuth() {
  $('authDialog').classList.remove('unlocking', 'denied');
  $('authForm').reset(); $('masterPassword').type = 'password'; $('authError').textContent = '';
  const exists = Boolean(localStorage.getItem(STORAGE));
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
    const stored = localStorage.getItem(STORAGE), password = $('masterPassword').value;
    if (!stored && password !== $('confirmPassword').value) throw new Error('The master passwords do not match.');
    const candidateEnvelope = stored ? validateEnvelope(JSON.parse(stored)) : { salt: b64(crypto.getRandomValues(new Uint8Array(16))) };
    const candidateKey = await derive(password, unb64(candidateEnvelope.salt));
    let candidateVault = [];
    if (stored) {
      try { candidateVault = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(candidateEnvelope.iv) }, candidateKey, unb64(candidateEnvelope.data)))); }
      catch { throw new Error('Could not unlock. Check your master password; the vault may also be damaged.'); }
      if (!Array.isArray(candidateVault) || candidateVault.some(item => !item || ['id', 'name', 'username', 'url', 'password', 'notes'].some(field => typeof item[field] !== 'string'))) throw new Error('The vault contains invalid records.');
    }
    key = candidateKey; envelope = candidateEnvelope; vault = candidateVault;
    if (!stored) await persist();
    $('authForm').reset();
    $('authTitle').textContent = 'Your treasures await.';
    $('authDescription').textContent = 'The right key. A little magic. Welcome to your vault.';
    $('authDialog').classList.add('unlocking');
    await new Promise(resolve => setTimeout(resolve, matchMedia('(prefers-reduced-motion: reduce)').matches ? 150 : 1650));
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
$('exportBtn').onclick = () => {
  if (!key) return;
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), anchor = element('a');
  anchor.href = url; anchor.download = `password-backup-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Encrypted backup downloaded. Keep your master password.');
};
$('importBtn').onclick = () => { $('importFile').value = ''; $('importFile').click(); };
$('importFile').onchange = async () => {
  const file = $('importFile').files[0]; if (!file) return;
  try {
    if (file.size > 12000000) throw new Error('Backup is too large.');
    const imported = validateEnvelope(JSON.parse(await file.text()));
    if (!confirm('Replace this vault with the encrypted backup? Export your current vault first. You will need the backup’s master password.')) return;
    localStorage.setItem(STORAGE, JSON.stringify(imported)); lock(); notify('Backup imported. Unlock with its master password.');
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
window.addEventListener('storage', event => { if (event.key === STORAGE && key) { lock(); notify('Vault changed in another tab. Unlock again.'); } });
initializeBrand(); render(); configureAuth();
