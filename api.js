// ============================================================
// API হেল্পার - Google Apps Script ব্যাকএন্ডের সাথে যোগাযোগ (ক্যাশিং সহ, ফাস্ট)
// ============================================================

const _cache = new Map();
const _inflight = new Map();
const CACHE_TTL_MS = 20000; // ২০ সেকেন্ড ক্যাশ - বারবার একই ডেটা আনতে দেরি হবে না

async function apiGet(action, params, opts) {
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  if (params) {
    Object.keys(params).forEach(k => {
      if (params[k] !== undefined && params[k] !== null) url.searchParams.set(k, params[k]);
    });
  }
  const cacheKey = url.toString();
  const useCache = !(opts && opts.noCache);

  if (useCache && _cache.has(cacheKey)) {
    const cached = _cache.get(cacheKey);
    if (Date.now() - cached.time < CACHE_TTL_MS) return cached.data;
  }

  // একই সময়ে একই রিকোয়েস্ট দুইবার গেলে একটিই পাঠানো হবে
  if (_inflight.has(cacheKey)) return _inflight.get(cacheKey);
  const p = (async () => {
    const res = await fetch(cacheKey);
    const data = await res.json();
    if (useCache) _cache.set(cacheKey, { data, time: Date.now() });
    return data;
  })();
  _inflight.set(cacheKey, p);
  p.then(() => _inflight.delete(cacheKey), () => _inflight.delete(cacheKey));
  return p;
}

// আগের সেভ করা উত্তর সাথে সাথে দেখায় (onData(res, true)), তারপর নতুন ডেটা এনে আবার দেখায় (onData(res, false))
async function apiGetSWR(action, params, onData) {
  const lsKey = 'swr_' + action + '_' + JSON.stringify(params || {});
  let hadCache = false;
  try {
    const c = localStorage.getItem(lsKey);
    if (c) { onData(JSON.parse(c), true); hadCache = true; }
  } catch (e) {}
  try {
    const res = await apiGet(action, params, { noCache: true });
    if (res && res.ok) { try { localStorage.setItem(lsKey, JSON.stringify(res)); } catch (e) {} }
    if (res && (res.ok || !hadCache)) onData(res, false);
  } catch (err) {
    if (!hadCache) throw err;
  }
}

async function apiPost(action, body) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...body })
  });
  const data = await res.json();
  clearApiCache(); // ডেটা পরিবর্তন হলে ক্যাশ বাতিল
  return data;
}

function clearApiCache() {
  _cache.clear();
}

// ---------- সেশন ম্যানেজমেন্ট ----------

const Session = {
  KEY: 'tour_admin_session',
  set(data) { sessionStorage.setItem(this.KEY, JSON.stringify(data)); },
  get() { const raw = sessionStorage.getItem(this.KEY); return raw ? JSON.parse(raw) : null; },
  clear() { sessionStorage.removeItem(this.KEY); },
  isLoggedIn() { return !!this.get(); }
};

// ---------- সাধারণ ইউটিলিটি ----------

function formatTaka(amount) {
  const n = Number(amount) || 0;
  return '৳' + n.toLocaleString('bn-BD');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('bn-BD', { year: 'numeric', month: 'long', day: 'numeric' });
}

function toBengaliNumber(num) {
  const bn = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
  return String(num).replace(/[0-9]/g, d => bn[d]);
}

function qs(sel, root) { return (root || document).querySelector(sel); }
function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function showToast(msg, type) {
  let container = qs('#toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + (type || 'info');
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3500);
}

// ---------- শেয়ার্ড হেডার/ফুটার (সাইট জুড়ে একই তথ্য দেখানোর জন্য) ----------

function renderSiteHeaderFooter() {
  const adminLineEls = qsa('.js-header-admin-line');
  adminLineEls.forEach(el => el.textContent = SITE_CONFIG.headerAdminLine);

  // গ্রুপের নাম - বাংলা ও ইংরেজি একসাথে
  const groupNameEls = qsa('.js-group-name');
  groupNameEls.forEach(el => {
    el.innerHTML = `${escapeHtml(SITE_CONFIG.groupNameBn)}<span class="group-name-en">${escapeHtml(SITE_CONFIG.groupNameEn)}</span>`;
  });

  // শুধু বাংলা নাম দরকার এমন জায়গার জন্য (যেমন টিকেট)
  const groupNameBnEls = qsa('.js-group-name-bn');
  groupNameBnEls.forEach(el => el.textContent = SITE_CONFIG.groupNameBn);

  const taglineEls = qsa('.js-tagline');
  taglineEls.forEach(el => el.textContent = SITE_CONFIG.tagline);

  // ফুটার/প্রিন্ট/টিকেটের সবার নিচের পাওয়ার্ড বাই লাইন
  const poweredByEls = qsa('.js-powered-by');
  poweredByEls.forEach(el => el.textContent = SITE_CONFIG.poweredByLine);

  // ফুটারের সোশ্যাল মিডিয়া লিংক (বাম পাশে)
  const socialContainers = qsa('.js-social-links');
  socialContainers.forEach(container => {
    container.innerHTML = '';
    const ICONS = {
      facebook: '<svg viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>',
      youtube: '<svg viewBox="0 0 24 24"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/></svg>',
      instagram: '<svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>',
      tiktok: '<svg viewBox="0 0 24 24"><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.4 2.6 2.1 4.2 5 4.5"/></svg>'
    };
    const links = [
      { url: SITE_CONFIG.facebookUrl, label: 'Facebook', icon: 'facebook' },
      { url: SITE_CONFIG.youtubeUrl, label: 'YouTube', icon: 'youtube' },
      { url: SITE_CONFIG.instagramUrl, label: 'Instagram', icon: 'instagram' },
      { url: SITE_CONFIG.tiktokUrl, label: 'TikTok', icon: 'tiktok' }
    ];
    links.forEach(l => {
      if (l.url) {
        const a = document.createElement('a');
        a.href = l.url; a.target = '_blank'; a.rel = 'noopener';
        a.title = l.label; a.setAttribute('aria-label', l.label);
        a.innerHTML = ICONS[l.icon];
        container.appendChild(a);
      }
    });
  });
}

// ---------- ব্যবস্থাপনা মেনুর সেটিংস (Google Sheet থেকে) ----------

const SETTINGS_CACHE_KEY = 'tour_site_settings';
const SETTING_FIELDS = [
  'siteNameBn', 'siteNameEn', 'tagline', 'address',
  'mobile1', 'mobile2', 'mobile3', 'email',
  'logoUrl', 'heroImageUrl',
  'facebookUrl', 'youtubeUrl', 'instagramUrl', 'tiktokUrl'
];

function applySettings(s) {
  if (!s) return;
  if (s.siteNameBn) SITE_CONFIG.groupNameBn = s.siteNameBn;
  if (s.siteNameEn) SITE_CONFIG.groupNameEn = s.siteNameEn;
  if (s.tagline) SITE_CONFIG.tagline = s.tagline;
  if (s.logoUrl) SITE_CONFIG.logoUrl = s.logoUrl;
  if (s.heroImageUrl) SITE_CONFIG.heroImageUrl = s.heroImageUrl;
  SITE_CONFIG.address = s.address || SITE_CONFIG.address || '';
  SITE_CONFIG.email = s.email || SITE_CONFIG.email || '';
  SITE_CONFIG.mobiles = [s.mobile1, s.mobile2, s.mobile3].filter(Boolean);
  if (s.facebookUrl !== undefined) SITE_CONFIG.facebookUrl = s.facebookUrl;
  if (s.youtubeUrl !== undefined) SITE_CONFIG.youtubeUrl = s.youtubeUrl;
  if (s.instagramUrl !== undefined) SITE_CONFIG.instagramUrl = s.instagramUrl;
  if (s.tiktokUrl !== undefined) SITE_CONFIG.tiktokUrl = s.tiktokUrl;
}

function renderSiteContactInfo() {
  qsa('.js-site-contact').forEach(el => {
    const parts = [];
    if (SITE_CONFIG.address) parts.push(`<div>📍 ${escapeHtml(SITE_CONFIG.address)}</div>`);
    (SITE_CONFIG.mobiles || []).forEach(m => parts.push(`<div>📞 <a href="tel:${escapeHtml(m)}">${escapeHtml(m)}</a></div>`));
    if (SITE_CONFIG.email) parts.push(`<div>✉️ <a href="mailto:${escapeHtml(SITE_CONFIG.email)}">${escapeHtml(SITE_CONFIG.email)}</a></div>`);
    el.innerHTML = parts.join('');
  });
}

function renderHeroImage() {
  const hero = qs('.hero');
  if (!hero || !SITE_CONFIG.heroImageUrl) return;
  hero.style.backgroundImage =
    `linear-gradient(180deg, rgba(37,116,84,0.72), rgba(37,116,84,0.84)), url("${SITE_CONFIG.heroImageUrl}")`;
  hero.style.backgroundSize = 'cover';
  hero.style.backgroundPosition = 'center';
}

function renderAllSiteInfo() {
  renderSiteHeaderFooter();
  renderBrandLogos();
  renderSiteContactInfo();
  renderHeroImage();
}

async function loadSiteSettings() {
  // আগের সেভ করা সেটিংস দিয়ে সাথে সাথে দেখানো, তারপর নতুন ডেটা এনে আপডেট
  try {
    const cached = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (cached) { applySettings(JSON.parse(cached)); renderAllSiteInfo(); }
  } catch (e) {}
  // হোমপেজ নিজেই getBootstrap থেকে সেটিংস আনে, আলাদা কল লাগবে না
  if (typeof SETTINGS_FROM_BOOTSTRAP !== 'undefined') return;
  try {
    const res = await apiGet('getSettings', null, { noCache: true });
    if (res && res.ok && res.data) {
      applySettings(res.data);
      try { localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(res.data)); } catch (e) {}
      renderAllSiteInfo();
    }
  } catch (e) {}
}

document.addEventListener('DOMContentLoaded', () => {
  renderAllSiteInfo();
  setupHamburgerMenu();
  loadSiteSettings();
});

function renderBrandLogos() {
  if (!SITE_CONFIG.logoUrl) return;
  qsa('.brand-mark').forEach(el => {
    el.innerHTML = `<img src="${escapeHtml(SITE_CONFIG.logoUrl)}" alt="logo">`;
  });
}

function setupHamburgerMenu() {
  const btn = qs('.hamburger-btn');
  const nav = qs('.header-nav');
  if (!btn || !nav) return;
  btn.addEventListener('click', () => nav.classList.toggle('open'));
}
