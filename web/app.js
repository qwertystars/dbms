// Kutumb — family tree SPA (vanilla JS, hash router, cookie auth)

const app = document.getElementById('app');
const banner = document.getElementById('banner');
const overlay = document.getElementById('overlay');

let ME = null;
let justSignedUp = false;

// ---------- utilities ----------

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function showBanner(msg) {
  banner.textContent = msg;
  banner.classList.remove('hidden');
  setTimeout(() => banner.classList.add('hidden'), 4000);
}

async function api(path, opts = {}) {
  const init = { method: opts.method || 'GET', headers: {} };
  if (opts.body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, init);
  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) data = await res.json();
  if (!res.ok) {
    const err = new Error((data && (data.message || data.error)) || ('HTTP ' + res.status));
    err.status = res.status;
    throw err;
  }
  return data;
}

function personLabel(p) {
  if (!p) return '';
  return p.name;
}

// father/mother ordering: male partner first, fallback to array order
function splitPartners(partners) {
  const arr = (partners || []).slice();
  const fa = arr.find(p => p.gender === 'm');
  let mo = null;
  for (const p of arr) if (p !== fa && p.gender === 'f') { mo = p; break; }
  if (!fa && !mo) return { a: arr[0] || null, b: arr[1] || null };
  if (!mo) mo = arr.find(p => p !== fa) || null;
  return { a: fa || arr[0], b: mo };
}

// ---------- router ----------

const routes = [
  { re: /^#\/login$/, fn: renderLogin },
  { re: /^#\/trees$/, fn: renderTrees },
  { re: /^#\/tree\/([\w-]+)$/, fn: renderTree },
];

async function route() {
  closeOverlay();
  closeSmallBox();
  const h = location.hash || '#/login';
  for (const r of routes) {
    const m = h.match(r.re);
    if (m) {
      try { await r.fn(...m.slice(1)); } catch (e) {
        showBanner(e.message || 'Request failed');
        if (e.status === 401) { ME = null; location.hash = '#/login'; }
      }
      return;
    }
  }
  location.hash = '#/login';
}

window.addEventListener('hashchange', route);

// ---------- auth screens ----------

async function renderLogin() {
  if (!ME) {
    try { ME = (await api('/api/me')).user; } catch (e) { ME = null; }
  }
  if (ME) { location.hash = '#/trees'; return; }

  app.innerHTML = `
    <div class="auth-wrap">
      <h1 class="brand">Kutumb</h1>
      <p class="tagline">One tree. Every relation, in your language.</p>
      <div class="card">
        <div class="tabs">
          <button id="tab-login" class="active">Log in</button>
          <button id="tab-signup">Sign up</button>
        </div>
        <form id="f-login">
          <label>Email<input name="email" type="email" required></label>
          <label>Password<input name="password" type="password" required minlength="8"></label>
          <button class="primary" type="submit">Log in</button>
        </form>
        <form id="f-signup" class="hidden">
          <label>Name<input name="name" required></label>
          <label>Email<input name="email" type="email" required></label>
          <label>Password<input name="password" type="password" required minlength="8"></label>
          <label>Language
            <select name="lang">
              <option value="en">English</option>
              <option value="hi">हिन्दी (Hindi)</option>
              <option value="ta">தமிழ் (Tamil)</option>
              <option value="bn">বাংলা (Bengali)</option>
            </select>
          </label>
          <button class="primary" type="submit">Create account</button>
        </form>
      </div>
    </div>`;

  const tabL = document.getElementById('tab-login');
  const tabS = document.getElementById('tab-signup');
  const fLogin = document.getElementById('f-login');
  const fSignup = document.getElementById('f-signup');
  tabL.onclick = () => { tabL.classList.add('active'); tabS.classList.remove('active'); fLogin.classList.remove('hidden'); fSignup.classList.add('hidden'); };
  tabS.onclick = () => { tabS.classList.add('active'); tabL.classList.remove('active'); fSignup.classList.remove('hidden'); fLogin.classList.add('hidden'); };

  document.getElementById('f-login').onsubmit = async ev => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    try {
      banner.classList.add('hidden');
      ME = (await api('/api/login', { method: 'POST', body: Object.fromEntries(fd) })).user;
      location.hash = '#/trees';
    } catch (e) { showBanner(e.message); }
  };
  document.getElementById('f-signup').onsubmit = async ev => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    try {
      banner.classList.add('hidden');
      await api('/api/signup', { method: 'POST', body: Object.fromEntries(fd) });
      ME = (await api('/api/login', { method: 'POST', body: Object.fromEntries(fd) })).user;
      justSignedUp = true;
      location.hash = '#/trees';
    } catch (e) { showBanner(e.message); }
  };
}

// ---------- trees list ----------

async function renderTrees() {
  if (!ME) {
    try { ME = (await api('/api/me')).user; } catch (e) { ME = null; }
  }
  if (!ME) { location.hash = '#/login'; return; }

  if (justSignedUp) {
    justSignedUp = false;
    showBanner('Account created — welcome to Kutumb!');
  }

  const data = await api('/api/trees');
  app.innerHTML = `
    <h1 class="brand">Your families</h1>
    <p class="tagline">Pick a tree to explore relations.</p>
    <div class="new-tree-row card">
      <input id="nt-name" placeholder="New family tree name…">
      <button id="nt-go" class="btn-primary" style="margin-top:0;width:auto">Create</button>
      <button id="logout-btn" class="btn-primary" style="margin-top:0;width:auto;background:#7d8c84">Log out</button>
    </div>
    <div class="tree-list">
      ${data.trees.map(t => `
        <div class="tree-item" data-id="${esc(t.tree_id)}">
          <h3>${esc(t.name)}</h3>
          <span class="role-badge">${esc(t.role)}</span>
        </div>`).join('') || '<div class="loading">No trees yet — create one above.</div>'}
    </div>`;

  document.getElementById('logout-btn').onclick = async () => {
    try { await api('/api/logout', { method: 'POST' }); } catch (e) { /* cookie cleared regardless */ }
    ME = null;
    location.hash = '#/login';
  };
  document.querySelectorAll('.tree-item').forEach(el => {
    el.onclick = () => { location.hash = '#/tree/' + el.dataset.id; };
  });
  document.getElementById('nt-go').onclick = async () => {
    const name = document.getElementById('nt-name').value.trim();
    if (!name) return;
    try {
      const t = await api('/api/trees', { method: 'POST', body: { name } });
      location.hash = '#/tree/' + t.tree_id;
    } catch (e) { showBanner(e.message); }
  };
}

// ---------- tree board ----------

let TREE = null; // {id, role}
let GEN_DATA = null;

async function renderTree(id) {
  if (!ME) { location.hash = '#/login'; return; }
  const [treesData, gens] = await Promise.all([
    api('/api/trees'),
    api('/api/trees/' + id + '/generations'),
  ]);
  const mine = treesData.trees.find(t => t.tree_id === id);
  if (!mine) { showBanner('Tree not found or no access'); location.hash = '#/trees'; return; }
  TREE = { id, role: mine.role, name: mine.name };
  GEN_DATA = gens;

  const bands = gens.generations || [];
  app.innerHTML = `
    <h1 class="brand">${esc(mine.name)}</h1>
    <p class="tagline">Generation strips · click a couple for details${TREE.role === 'creator' ? ' · you can delete this tree via API' : ''}</p>
    <div class="board-wrap"><div class="board" id="board">
      ${bands.map(b => `
        <div class="band" data-gen="${b.gen}">
          <span class="gen-label">G${b.gen}</span>
          ${b.couples.length === 0 ? '<div class="loading">no couples recorded</div>' : ''}
          ${b.couples.map(c => {
            const { a, b: bb } = splitPartners(c.partners);
            return `
            <div class="couple-card" data-couple="${esc(c.couple_id)}">
              <div class="names">
                <span>${esc(personLabel(a)) || '—'}</span><span class="heart">&hearts;</span><span>${esc(personLabel(bb)) || '—'}</span>
              </div>
              <div class="meta">${c.child_count} child${c.child_count === 1 ? '' : 'ren'}${c.other_info ? ' · ' + esc(String(c.other_info).slice(0, 28)) : ''}</div>
            </div>`;
          }).join('')}
        </div>`).join('')}
    </div></div>`;

  drawWires();

  document.querySelectorAll('.couple-card').forEach(el => {
    el.onclick = ev => openSmallBox(ev, el.dataset.couple);
  });
}

// connector lines between consecutive bands
function drawWires() {
  const board = document.getElementById('board');
  const svgNS = 'http://www.w3.org/2000/svg';
  let svg = board.querySelector('svg.wires');
  if (!svg) {
    svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'wires');
    board.prepend(svg);
  }
  const brect = board.getBoundingClientRect();
  svg.setAttribute('viewBox', `0 0 ${brect.width} ${brect.height}`);
  svg.innerHTML = '';
  const bands = [...board.querySelectorAll('.band')];
  for (let i = 1; i < bands.length; i++) {
    const ups = [...bands[i - 1].querySelectorAll('.couple-card')];
    const downs = [...bands[i].querySelectorAll('.couple-card')];
    for (const u of ups) for (const d of downs) {
      const ur = u.getBoundingClientRect(), dr = d.getBoundingClientRect();
      const ln = document.createElementNS(svgNS, 'line');
      ln.setAttribute('x1', ur.left + ur.width / 2 - brect.left);
      ln.setAttribute('y1', ur.bottom - brect.top);
      ln.setAttribute('x2', dr.left + dr.width / 2 - brect.left);
      ln.setAttribute('y2', dr.top - brect.top);
      ln.setAttribute('stroke', '#9db8a9');
      ln.setAttribute('stroke-width', '1.6');
      svg.appendChild(ln);
    }
  }
}
window.addEventListener('resize', () => { if (GEN_DATA) drawWires(); });

// ---------- small box (father / mother / other information) ----------

function coupleById(cid) {
  for (const b of GEN_DATA.generations) {
    const c = b.couples.find(x => x.couple_id === cid);
    if (c) return c;
  }
  return null;
}

function openSmallBox(ev, cid) {
  closeSmallBox();
  const c = coupleById(cid);
  if (!c) return;
  const { a, b } = splitPartners(c.partners);
  const box = document.createElement('div');
  box.className = 'smallbox';
  box.id = 'smallbox';
  box.innerHTML = `
    <button class="close-x" id="sb-close">×</button>
    <h3>${esc(TREE.name)} · couple</h3>
    <div class="row"><span class="lbl">Father name</span>
      <button class="person-link" data-pid="${esc(a && a.person_id)}">${esc(a && a.name)}</button></div>
    <div class="row"><span class="lbl">Mother name</span>
      <button class="person-link" data-pid="${esc(b && b.person_id)}">${esc(b && b.name)}</button></div>
    <div class="row"><span class="lbl">Other information</span>${esc(c.other_info || '—')}</div>`;
  document.body.appendChild(box);

  const r = (ev.currentTarget || ev.target).getBoundingClientRect();
  const bx = box.getBoundingClientRect();
  let left = Math.min(r.left + window.scrollX, window.innerWidth - bx.width - 12);
  let top = r.bottom + window.scrollY + 8;
  if (top + bx.height > window.scrollY + window.innerHeight) top = r.top + window.scrollY - bx.height - 8;
  box.style.left = Math.max(8, left) + 'px';
  box.style.top = top + 'px';

  box.querySelector('#sb-close').onclick = closeSmallBox;
  box.querySelectorAll('.person-link').forEach(btn => {
    btn.onclick = e2 => { e2.stopPropagation(); if (btn.dataset.pid) openBigModal(btn.dataset.pid); };
  });
}

function closeSmallBox() {
  const old = document.getElementById('smallbox');
  if (old) old.remove();
}

document.addEventListener('click', ev => {
  const sb = document.getElementById('smallbox');
  if (sb && !sb.contains(ev.target) && !ev.target.closest('.couple-card')) closeSmallBox();
});

// ---------- big modal (all person fields + kinship badge) ----------

const FIELD_DEFS = [
  ['name', 'Name'], ['gender', 'Gender'], ['dob', 'Date of birth'], ['dod', 'Date of death'],
  ['height', 'Height'], ['weight', 'Weight'], ['address', 'Address'], ['mail', 'Mail'],
  ['phone', 'Phone'], ['job', 'Job'], ['degree', 'Degree'], ['place', 'Place'],
];

async function openBigModal(pid) {
  overlay.classList.remove('hidden');
  overlay.innerHTML = '<div class="modal"><div class="loading">Loading person…</div></div>';
  const p = await api('/api/persons/' + pid);

  let kinship = '';
  if (ME && ME.person_id && ME.person_id !== pid && TREE) {
    try {
      const k = await api('/api/kinship?tree=' + encodeURIComponent(TREE.id) +
        '&from=' + encodeURIComponent(ME.person_id) +
        '&to=' + encodeURIComponent(pid));
      const lang = ME.lang || 'en';
      const termObj = (k.terms && k.terms[lang]) || (k.terms && k.terms.en);
      kinship = `<span class="kinship-badge">${esc(termObj && termObj.term)}</span>
        <div class="kinship-gloss">${esc(k.gloss || (termObj && termObj.gloss) || '')}</div>`;
    } catch (e) { /* badge is best-effort */ }
  }

  overlay.innerHTML = `
    <div class="modal">
      ${p.photo_url ? `<img class="photo" src="${esc(p.photo_url)}" alt="photo">` : ''}
      <h2>${esc(p.name)}</h2>
      <div class="sub">${esc(genderWord(p.gender))}${p.dob ? ' · ' + esc(p.dob) : ''}</div>
      ${kinship}
      <div class="fields">
        ${FIELD_DEFS.map(([k, label]) => `
          <div class="field"><div class="k">${label}</div><div class="v">${esc(p[k] ?? '—')}</div></div>`).join('')}
        <div class="field wide"><div class="k">Other information</div><div class="v">${esc(p.other_info ?? '—')}</div></div>
      </div>
      <div class="actions"><button id="m-close">Close</button></div>
    </div>`;
  document.getElementById('m-close').onclick = closeOverlay;
  overlay.onclick = ev => { if (ev.target === overlay) closeOverlay(); };
}

function genderWord(g) {
  return g === 'm' ? 'Male' : g === 'f' ? 'Female' : 'Other';
}

function closeOverlay() {
  overlay.classList.add('hidden');
  overlay.innerHTML = '';
}

// ---------- boot ----------

route();
