/* ═══════════════════════════════════════════════
   BLACK BOX — app.js
   Offline-first PWA · Google Drive photo backup
═══════════════════════════════════════════════ */

'use strict';

/* ────────────────────────────────────────────
   CONSTANTS
──────────────────────────────────────────── */
const LS_BOXES      = 'blackbox_boxes';
const LS_SETTINGS   = 'blackbox_settings';
const DRIVE_SCOPE   = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_UPLOAD  = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
const DRIVE_FILES   = 'https://www.googleapis.com/drive/v3/files';

const DEFAULT_TAGS = [
  'Christmas','Winter','Summer','Spring','Autumn',
  'Clothes','Shoes','Bedding','Pillows','Towels',
  'Electronics','Tools','Sports','Kids','Books',
  'Kitchen','Holiday','Decor','Documents','Fragile'
];

/* ────────────────────────────────────────────
   STATE
──────────────────────────────────────────── */
let S = {
  boxes:        [],
  settings:     { googleClientId: '', driveFolderId: '' },
  currentBoxId: null,
  editingBoxId: null,
  editingItemId:null,
  pendingPhotos:[],   // { id, dataUrl, driveId?, driveUrl? }
  activeFilter: null,
  gToken:       null, // Google OAuth access token
  gUser:        null, // { name, email, picture }
};

/* ────────────────────────────────────────────
   STORAGE
──────────────────────────────────────────── */
function persist() {
  localStorage.setItem(LS_BOXES,    JSON.stringify(S.boxes));
  localStorage.setItem(LS_SETTINGS, JSON.stringify(S.settings));
}

function hydrate() {
  try { S.boxes    = JSON.parse(localStorage.getItem(LS_BOXES)    || '[]'); } catch(e){ S.boxes=[]; }
  try { S.settings = JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}'); } catch(e){ S.settings={}; }
  S.settings.driveFolderId = S.settings.driveFolderId || '';
  S.settings.googleClientId = S.settings.googleClientId || '';
}

/* ────────────────────────────────────────────
   TOAST
──────────────────────────────────────────── */
let toastTimer;
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
}

/* ────────────────────────────────────────────
   VIEW NAVIGATION
──────────────────────────────────────────── */
let activeView = 'boxes';

function showView(id) {
  // Mark previous view as "behind" when going into detail
  const prev = document.getElementById('view-' + activeView);
  if (id === 'detail') {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active', 'behind'));
    if (prev) prev.classList.add('behind');
  } else {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active', 'behind'));
  }
  const next = document.getElementById('view-' + id);
  if (next) { next.classList.add('active'); activeView = id; }

  // Sync nav
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.view === id || (id === 'detail' && b.dataset.view === 'boxes'));
  });
}

/* ────────────────────────────────────────────
   HELPERS
──────────────────────────────────────────── */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);

function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getBox(id) { return S.boxes.find(b => b.id === id) || null; }

function shakeField(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('error');
  el.animate([{transform:'translateX(-5px)'},{transform:'translateX(5px)'},{transform:'translateX(0)'}],{duration:200});
  setTimeout(()=>el.classList.remove('error'), 2000);
}

function pinIcon(size=13) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="${size}" height="${size}"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
}

/* ────────────────────────────────────────────
   TAG UTILITIES
──────────────────────────────────────────── */
function allTags() {
  const custom = [...new Set(S.boxes.flatMap(b => b.tags || []))].filter(t => !DEFAULT_TAGS.includes(t));
  return [...DEFAULT_TAGS, ...custom];
}

function usedTags() {
  return [...new Set(S.boxes.flatMap(b => b.tags || []))].sort();
}

/* ────────────────────────────────────────────
   RENDER: BOX LIST
──────────────────────────────────────────── */
function renderBoxList() {
  renderFilterRow();
  const el = document.getElementById('boxList');
  let boxes = S.activeFilter
    ? S.boxes.filter(b => (b.tags||[]).includes(S.activeFilter))
    : S.boxes;

  if (!boxes.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
        </div>
        <div class="empty-title">${S.activeFilter ? 'No boxes with this tag' : 'No boxes yet'}</div>
        <p class="empty-sub">${S.activeFilter ? 'Try a different filter.' : 'Tap <strong>New Box</strong> to start cataloguing your storage.'}</p>
        ${!S.activeFilter ? `<button class="btn primary" onclick="openBoxModal()">Add First Box</button>` : ''}
      </div>`;
    return;
  }

  el.innerHTML = boxes.map((box, i) => {
    const items = box.items || [];
    const tags  = (box.tags || []).slice(0,4);
    const photo = (box.photos||[])[0];
    const delay = Math.min(i * 40, 200);
    return `
    <div class="box-card" data-id="${box.id}" style="animation-delay:${delay}ms" role="button" tabindex="0">
      <div class="box-card-top">
        <div style="flex:1;min-width:0">
          <div class="box-card-id">BOX #${esc(box.boxId)}</div>
          <div class="box-card-desc">${esc(box.description) || '<span style="color:var(--gray-300)">No description</span>'}</div>
        </div>
        ${photo
          ? `<img class="box-card-thumb" src="${photo.url}" alt="Box photo" loading="lazy"/>`
          : `<div style="width:52px;height:52px;background:var(--gray-100);border-radius:var(--r-md);border:1px solid var(--gray-200);flex-shrink:0;display:flex;align-items:center;justify-content:center;color:var(--gray-300)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
             </div>`
        }
      </div>
      <div class="box-card-meta">
        <div class="box-tags">
          ${box.location ? `<span class="box-card-location">${pinIcon(12)} ${esc(box.location)}</span>` : ''}
          ${tags.map(t => `<span class="tag-pill">${esc(t)}</span>`).join('')}
        </div>
        <span class="box-item-count">${items.length} item${items.length!==1?'s':''}</span>
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('.box-card').forEach(card => {
    card.addEventListener('click', () => openDetail(card.dataset.id));
    card.addEventListener('keydown', e => { if(e.key==='Enter') openDetail(card.dataset.id); });
  });
}

function renderFilterRow() {
  const tags = usedTags();
  const el = document.getElementById('filterRow');
  if (!tags.length) { el.innerHTML = ''; return; }
  el.innerHTML = ['All', ...tags].map(t => {
    const isAll = t === 'All';
    const active = isAll ? !S.activeFilter : S.activeFilter === t;
    return `<button class="filter-chip${active?' active':''}" data-tag="${isAll?'':t}">${esc(t)}</button>`;
  }).join('');
  el.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      S.activeFilter = chip.dataset.tag || null;
      renderBoxList();
    });
  });
}

/* ────────────────────────────────────────────
   RENDER: BOX DETAIL
──────────────────────────────────────────── */
function openDetail(id) {
  S.currentBoxId = id;
  const box = getBox(id);
  if (!box) return;
  document.getElementById('detailBarLabel').textContent = `BOX #${box.boxId}`;
  renderDetail(box);
  showView('detail');
}

function renderDetail(box) {
  const items  = box.items  || [];
  const photos = box.photos || [];
  const tags   = box.tags   || [];
  const el = document.getElementById('detailContent');

  el.innerHTML = `
    <div class="detail-hero">
      <div class="detail-id-label">BOX #${esc(box.boxId)}</div>
      <div class="detail-title">${esc(box.description) || 'No description'}</div>
      ${box.location ? `<div class="detail-location-badge">${pinIcon(13)} ${esc(box.location)}</div>` : ''}
      ${tags.length ? `<div class="detail-tags">${tags.map(t=>`<span class="tag-pill">${esc(t)}</span>`).join('')}</div>` : ''}
    </div>

    ${photos.length ? `
    <div class="photos-section">
      <div class="section-hd">
        <span class="section-title">Photos (${photos.length})</span>
        <button class="btn ghost small" id="addMorePhotosBtn">+ Add</button>
      </div>
      <div class="photo-grid">
        ${photos.map((p,i) => `<img class="photo-grid-img" src="${p.url}" data-idx="${i}" alt="Photo ${i+1}" loading="lazy"/>`).join('')}
      </div>
    </div>` : `
    <div class="photos-section">
      <div class="section-hd">
        <span class="section-title">Photos</span>
        <button class="btn ghost small" id="addMorePhotosBtn">+ Add</button>
      </div>
      <div style="padding:20px 0;text-align:center;font-size:13px;color:var(--gray-300)">No photos yet</div>
    </div>`}

    <div class="items-section">
      <div class="section-hd">
        <span class="section-title">Contents (${items.length})</span>
        <button class="btn ghost small" id="addItemDetailBtn">+ Add Item</button>
      </div>
      <div id="itemsList">
        ${items.length ? items.map(item => `
          <div class="item-row">
            <div class="item-content">
              <div class="item-name">${esc(item.name)}</div>
              ${item.notes ? `<div class="item-notes">${esc(item.notes)}</div>` : ''}
            </div>
            ${item.qty > 1 ? `<span class="item-qty">×${item.qty}</span>` : ''}
            <button class="item-del-btn" data-item="${item.id}" aria-label="Remove item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>`).join('')
          : `<div class="no-items">No items yet. Tap + Add Item.</div>`
        }
      </div>
    </div>`;

  // Photo viewer
  el.querySelectorAll('.photo-grid-img').forEach(img => {
    img.addEventListener('click', () => {
      document.getElementById('photoViewerImg').src = img.src;
      document.getElementById('photoViewer').classList.remove('hidden');
    });
  });

  // Add more photos (quick - opens box modal in edit mode scrolled to photos)
  const addPhotosBtn = el.querySelector('#addMorePhotosBtn');
  if (addPhotosBtn) addPhotosBtn.addEventListener('click', () => openBoxModal(S.currentBoxId, true));

  // Add item
  const addItemBtn = el.querySelector('#addItemDetailBtn');
  if (addItemBtn) addItemBtn.addEventListener('click', () => openItemModal());

  // Delete items
  el.querySelectorAll('.item-del-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      removeItem(btn.dataset.item);
    });
  });
}

/* ────────────────────────────────────────────
   BOX MODAL
──────────────────────────────────────────── */
function openBoxModal(editId = null, focusPhotos = false) {
  S.editingBoxId   = editId;
  S.pendingPhotos  = [];
  const isEdit = !!editId;

  document.getElementById('boxModalTitle').textContent = isEdit ? 'Edit Box' : 'New Box';

  // Populate location suggestions
  const usedLocs = [...new Set(S.boxes.map(b=>b.location).filter(Boolean))];
  document.getElementById('locationSuggestions').innerHTML =
    usedLocs.map(l => `<option value="${esc(l)}"/>`).join('');

  if (isEdit) {
    const box = getBox(editId);
    document.getElementById('f-id').value       = box.boxId      || '';
    document.getElementById('f-location').value = box.location   || '';
    document.getElementById('f-desc').value     = box.description|| '';
    S.pendingPhotos = (box.photos || []).map(p => ({ id: uid(), dataUrl: p.url, driveId: p.driveId, driveUrl: p.url, isDrive: !!p.driveId }));
    renderTagSelector(box.tags || []);
  } else {
    document.getElementById('f-id').value       = '';
    document.getElementById('f-location').value = '';
    document.getElementById('f-desc').value     = '';
    renderTagSelector([]);
  }

  renderPhotoPreviews();
  openModal('modal-box');

  if (focusPhotos) {
    setTimeout(() => {
      document.getElementById('photoUploadZone').scrollIntoView({ behavior:'smooth' });
    }, 400);
  }
}

function renderTagSelector(selected = []) {
  const tags = allTags();
  const el   = document.getElementById('tagSelector');
  el.innerHTML = tags.map(t => `
    <button type="button" class="tag-opt${selected.includes(t)?' selected':''}" data-tag="${esc(t)}">${esc(t)}</button>
  `).join('');
  el.querySelectorAll('.tag-opt').forEach(b => {
    b.addEventListener('click', () => b.classList.toggle('selected'));
  });
}

function getSelectedTags() {
  return [...document.querySelectorAll('#tagSelector .tag-opt.selected')].map(b => b.dataset.tag);
}

function saveBox() {
  const boxId    = document.getElementById('f-id').value.trim();
  const location = document.getElementById('f-location').value.trim();
  const desc     = document.getElementById('f-desc').value.trim();
  const tags     = getSelectedTags();

  if (!boxId)    { shakeField('f-id');       toast('Box ID is required', 'error'); return; }
  if (!location) { shakeField('f-location'); toast('Location is required', 'error'); return; }

  // Duplicate check
  const dup = S.boxes.find(b => b.boxId.toLowerCase() === boxId.toLowerCase() && b.id !== S.editingBoxId);
  if (dup) { shakeField('f-id'); toast('A box with this ID already exists', 'error'); return; }

  const photos = S.pendingPhotos.map(p => ({ url: p.dataUrl, driveId: p.driveId || null }));

  if (S.editingBoxId) {
    const box = getBox(S.editingBoxId);
    if (box) { box.boxId = boxId; box.location = location; box.description = desc; box.tags = tags; box.photos = photos; box.updatedAt = new Date().toISOString(); }
  } else {
    S.boxes.unshift({ id: uid(), boxId, location, description: desc, tags, photos, items: [], createdAt: new Date().toISOString() });
  }

  persist();
  renderBoxList();

  // Refresh detail if editing the currently open box
  if (S.editingBoxId && S.currentBoxId === S.editingBoxId) {
    const box = getBox(S.editingBoxId);
    document.getElementById('detailBarLabel').textContent = `BOX #${box.boxId}`;
    renderDetail(box);
  }

  closeModal('modal-box');
  toast(S.editingBoxId ? 'Box updated' : 'Box added', 'success');
  S.editingBoxId = null;
}

function deleteBox() {
  const box = getBox(S.currentBoxId);
  if (!box) return;
  if (!confirm(`Delete Box #${box.boxId}? All contents will be lost.`)) return;
  S.boxes = S.boxes.filter(b => b.id !== S.currentBoxId);
  persist();
  renderBoxList();
  showView('boxes');
  toast('Box deleted');
  S.currentBoxId = null;
}

/* ────────────────────────────────────────────
   PHOTO HANDLING
──────────────────────────────────────────── */
function renderPhotoPreviews() {
  const row = document.getElementById('photoPreviewRow');
  row.innerHTML = S.pendingPhotos.map(p => `
    <div class="photo-preview-item">
      <img src="${p.dataUrl}" alt="Preview"/>
      ${p.isDrive ? '<span style="position:absolute;bottom:2px;left:2px;background:rgba(0,0,0,.6);color:#fff;font-size:9px;padding:1px 4px;border-radius:3px">Drive</span>' : ''}
      <button class="photo-preview-remove" data-pid="${p.id}" aria-label="Remove">✕</button>
    </div>`).join('');

  row.querySelectorAll('.photo-preview-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      S.pendingPhotos = S.pendingPhotos.filter(p => p.id !== btn.dataset.pid);
      renderPhotoPreviews();
    });
  });
}

async function handlePhotoFiles(files) {
  for (const file of files) {
    const dataUrl = await readFileAsDataUrl(file);
    const pid = uid();
    S.pendingPhotos.push({ id: pid, dataUrl, file, isDrive: false });
    renderPhotoPreviews();
    // Try Drive upload in background
    uploadPhotoToDrive(file, pid);
  }
}

function readFileAsDataUrl(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload  = e => res(e.target.result);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

/* ────────────────────────────────────────────
   GOOGLE DRIVE
──────────────────────────────────────────── */
async function uploadPhotoToDrive(file, pendingId) {
  if (!S.gToken || !S.settings.driveFolderId) return;

  const progressWrap = document.getElementById('uploadProgress');
  const progressBar  = document.getElementById('uploadProgressBar');
  const progressText = document.getElementById('uploadProgressText');

  progressWrap.classList.remove('hidden');
  progressText.textContent = `Uploading ${file.name}…`;

  const metadata = JSON.stringify({
    name:    `blackbox_${Date.now()}_${file.name}`,
    parents: [S.settings.driveFolderId]
  });

  const form = new FormData();
  form.append('metadata', new Blob([metadata], { type: 'application/json' }));
  form.append('file', file);

  try {
    // Show indeterminate progress
    progressBar.style.setProperty('--progress', '60%');

    const res = await fetch(DRIVE_UPLOAD, {
      method: 'POST',
      headers: { Authorization: `Bearer ${S.gToken}` },
      body: form
    });

    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    const data = await res.json();

    // Make file publicly readable
    await fetch(`${DRIVE_FILES}/${data.id}/permissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${S.gToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' })
    });

    const driveUrl = `https://drive.google.com/uc?export=view&id=${data.id}`;

    // Update pending photo
    const ph = S.pendingPhotos.find(p => p.id === pendingId);
    if (ph) { ph.driveId = data.id; ph.dataUrl = driveUrl; ph.isDrive = true; ph.file = null; }

    progressBar.style.setProperty('--progress', '100%');
    progressText.textContent = 'Uploaded to Drive ✓';
    setTimeout(() => progressWrap.classList.add('hidden'), 2000);

    renderPhotoPreviews();
  } catch (e) {
    progressWrap.classList.add('hidden');
    console.warn('Drive upload failed, keeping local copy:', e.message);
  }
}

/* Google Identity Services */
function initGoogleAuth() {
  const savedToken = sessionStorage.getItem('bb_gtoken');
  const savedUser  = sessionStorage.getItem('bb_guser');
  if (savedToken) {
    S.gToken = savedToken;
    try { S.gUser = JSON.parse(savedUser); } catch(e){}
    updateDriveUI();
  }
}

function googleSignIn() {
  const clientId = prompt('Enter your Google OAuth Client ID:\n\n(Get one free at console.cloud.google.com → APIs & Services → Credentials)\n\nOr leave blank to skip.');
  if (!clientId) return;
  S.settings.googleClientId = clientId.trim();
  persist();

  if (!window.google) { toast('Google API not loaded. Check your connection.', 'error'); return; }

  window.google.accounts.oauth2.initTokenClient({
    client_id: S.settings.googleClientId,
    scope:     DRIVE_SCOPE + ' https://www.googleapis.com/auth/userinfo.profile email',
    callback:  async (resp) => {
      if (resp.error) { toast('Sign-in failed: ' + resp.error, 'error'); return; }
      S.gToken = resp.access_token;
      sessionStorage.setItem('bb_gtoken', S.gToken);
      // Fetch user info
      try {
        const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${S.gToken}` }
        });
        const u = await r.json();
        S.gUser = { name: u.name, email: u.email, picture: u.picture };
        sessionStorage.setItem('bb_guser', JSON.stringify(S.gUser));
      } catch(e){}
      updateDriveUI();
      toast('Signed in to Google ✓', 'success');
    }
  }).requestAccessToken();
}

function googleSignOut() {
  S.gToken = null; S.gUser = null;
  sessionStorage.removeItem('bb_gtoken');
  sessionStorage.removeItem('bb_guser');
  updateDriveUI();
  toast('Signed out');
}

function updateDriveUI() {
  const signedOut = document.getElementById('driveSignedOut');
  const signedIn  = document.getElementById('driveSignedIn');
  if (S.gToken && S.gUser) {
    signedOut.classList.add('hidden');
    signedIn.classList.remove('hidden');
    document.getElementById('driveUserName').textContent  = S.gUser.name  || '';
    document.getElementById('driveUserEmail').textContent = S.gUser.email || '';
    const av = document.getElementById('driveUserAvatar');
    if (S.gUser.picture) { av.src = S.gUser.picture; av.style.display=''; }
    else av.style.display = 'none';
  } else {
    signedOut.classList.remove('hidden');
    signedIn.classList.add('hidden');
  }
  document.getElementById('driveFolderId').value = S.settings.driveFolderId || '';
}

/* ────────────────────────────────────────────
   ITEM MODAL
──────────────────────────────────────────── */
function openItemModal(itemId = null) {
  S.editingItemId = itemId;
  document.getElementById('itemModalTitle').textContent = itemId ? 'Edit Item' : 'Add Item';
  if (itemId) {
    const box  = getBox(S.currentBoxId);
    const item = (box?.items||[]).find(i=>i.id===itemId);
    if (item) {
      document.getElementById('f-itemName').value  = item.name  || '';
      document.getElementById('f-itemQty').value   = item.qty   || 1;
      document.getElementById('f-itemNotes').value = item.notes || '';
    }
  } else {
    document.getElementById('f-itemName').value  = '';
    document.getElementById('f-itemQty').value   = '';
    document.getElementById('f-itemNotes').value = '';
  }
  openModal('modal-item');
}

function saveItem() {
  const name  = document.getElementById('f-itemName').value.trim();
  const qty   = parseInt(document.getElementById('f-itemQty').value)  || 1;
  const notes = document.getElementById('f-itemNotes').value.trim();

  if (!name) { shakeField('f-itemName'); toast('Item name is required', 'error'); return; }

  const box = getBox(S.currentBoxId);
  if (!box) return;
  if (!box.items) box.items = [];

  if (S.editingItemId) {
    const item = box.items.find(i=>i.id===S.editingItemId);
    if (item) { item.name=name; item.qty=qty; item.notes=notes; }
  } else {
    box.items.push({ id: uid(), name, qty, notes, addedAt: new Date().toISOString() });
  }

  persist();
  renderDetail(box);
  closeModal('modal-item');
  toast(S.editingItemId ? 'Item updated' : 'Item added', 'success');
  S.editingItemId = null;
}

function removeItem(itemId) {
  const box = getBox(S.currentBoxId);
  if (!box) return;
  box.items = (box.items||[]).filter(i=>i.id!==itemId);
  persist();
  renderDetail(box);
  toast('Item removed');
}

/* ────────────────────────────────────────────
   MODAL HELPERS
──────────────────────────────────────────── */
function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

/* ────────────────────────────────────────────
   SEARCH
──────────────────────────────────────────── */
function doSearch(q) {
  q = q.trim().toLowerCase();
  const panel = document.getElementById('searchResults');
  if (!q) { panel.classList.add('hidden'); return; }

  const hits = [];
  S.boxes.forEach(box => {
    const fields = [
      { label: null,     val: box.boxId },
      { label: null,     val: box.description },
      { label: 'Location', val: box.location },
      { label: 'Tag',    val: (box.tags||[]).join(' ') },
    ];
    (box.items||[]).forEach(item => {
      fields.push({ label: `Item in #${box.boxId}`, val: item.name });
      if (item.notes) fields.push({ label: `Item note`, val: item.notes });
    });

    for (const f of fields) {
      if ((f.val||'').toLowerCase().includes(q)) {
        hits.push({ box, matchLabel: f.label, matchVal: f.val });
        break;
      }
    }
  });

  if (!hits.length) {
    panel.innerHTML = `<div class="sr-empty">No results for "<strong>${esc(q)}</strong>"</div>`;
    panel.classList.remove('hidden');
    return;
  }

  panel.innerHTML = hits.slice(0,12).map(h => `
    <div class="sr-item" data-id="${h.box.id}">
      <span class="sr-box-id">BOX #${esc(h.box.boxId)}</span>
      <span class="sr-title">${esc(h.box.description||'No description')}</span>
      ${h.matchLabel ? `<span class="sr-match">${esc(h.matchLabel)}: ${highlightMatch(h.matchVal, q)}</span>` : ''}
    </div>`).join('');
  panel.classList.remove('hidden');

  panel.querySelectorAll('.sr-item').forEach(item => {
    item.addEventListener('click', () => {
      document.getElementById('searchInput').value = '';
      panel.classList.add('hidden');
      openDetail(item.dataset.id);
    });
  });
}

function highlightMatch(text, q) {
  return esc(text).replace(new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')', 'gi'), '<mark>$1</mark>');
}

/* ────────────────────────────────────────────
   EXPORT
──────────────────────────────────────────── */
function exportData() {
  const data = { exportedAt: new Date().toISOString(), boxes: S.boxes };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `black-box-export-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Exported ✓', 'success');
}

/* ────────────────────────────────────────────
   SERVICE WORKER
──────────────────────────────────────────── */
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('SW registered', reg.scope))
      .catch(e  => console.warn('SW failed', e));
  }
}

/* ────────────────────────────────────────────
   INIT
──────────────────────────────────────────── */
function init() {
  hydrate();
  initGoogleAuth();
  renderBoxList();

  /* Nav */
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  /* Back */
  document.getElementById('backBtn').addEventListener('click', () => {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('behind'));
    showView('boxes');
  });

  /* Add box */
  document.getElementById('openAddBox').addEventListener('click', () => openBoxModal());

  /* Edit / Delete box */
  document.getElementById('editBoxBtn').addEventListener('click', () => {
    if (S.currentBoxId) openBoxModal(S.currentBoxId);
  });
  document.getElementById('deleteBoxBtn').addEventListener('click', deleteBox);

  /* Box modal buttons */
  document.getElementById('saveBoxBtn').addEventListener('click', saveBox);
  document.getElementById('cancelBoxBtn').addEventListener('click', () => closeModal('modal-box'));

  /* Photo input */
  document.getElementById('photoInput').addEventListener('change', e => {
    handlePhotoFiles(Array.from(e.target.files||[]));
    e.target.value = '';
  });

  /* Custom tag */
  document.getElementById('addCustomTagBtn').addEventListener('click', () => {
    const inp = document.getElementById('customTagInp');
    const tag = inp.value.trim();
    if (!tag) return;
    const sel = document.getElementById('tagSelector');
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'tag-opt selected';
    btn.dataset.tag = tag; btn.textContent = tag;
    btn.addEventListener('click', () => btn.classList.toggle('selected'));
    sel.appendChild(btn);
    inp.value = '';
    inp.focus();
  });
  document.getElementById('customTagInp').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('addCustomTagBtn').click(); }
  });

  /* Item modal */
  document.getElementById('saveItemBtn').addEventListener('click', saveItem);
  document.getElementById('cancelItemBtn').addEventListener('click', () => closeModal('modal-item'));
  document.getElementById('f-itemName').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('saveItemBtn').click();
  });

  /* Settings */
  document.getElementById('googleSignInBtn').addEventListener('click', googleSignIn);
  document.getElementById('googleSignOutBtn').addEventListener('click', googleSignOut);
  document.getElementById('saveFolderBtn').addEventListener('click', () => {
    S.settings.driveFolderId = document.getElementById('driveFolderId').value.trim();
    persist();
    toast('Folder ID saved ✓', 'success');
  });
  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('clearAllBtn').addEventListener('click', () => {
    if (!confirm('Delete ALL boxes and data? This cannot be undone.')) return;
    S.boxes = []; persist(); renderBoxList();
    showView('boxes');
    toast('All data cleared');
  });

  /* Search */
  document.getElementById('searchInput').addEventListener('input', e => doSearch(e.target.value));
  document.addEventListener('click', e => {
    if (!e.target.closest('#searchResults') && !e.target.closest('#searchInput')) {
      document.getElementById('searchResults').classList.add('hidden');
    }
  });

  /* Photo viewer close */
  document.getElementById('photoViewerClose').addEventListener('click', () => {
    document.getElementById('photoViewer').classList.add('hidden');
  });
  document.getElementById('photoViewer').addEventListener('click', e => {
    if (e.target === document.getElementById('photoViewer')) {
      document.getElementById('photoViewer').classList.add('hidden');
    }
  });

  /* Close modals on backdrop tap */
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  registerSW();
}

document.addEventListener('DOMContentLoaded', init);
