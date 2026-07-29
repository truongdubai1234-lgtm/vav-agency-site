/* ============ SETTINGS (localStorage-backed) ============ */
const DEFAULT_SETTINGS = {
  messenger: "https://m.me/yourpage",
  telegram: "https://t.me/yourchannel",
  whatsapp: "https://wa.me/84000000000",
  wechat: "",
  email: "contact@vavagency.com",
  aiEndpoint: "", // e.g. https://your-server.com/api/chat — leave empty to use FAQ-only mode
  logoUrl: "logo.png", // bundled logo file next to index.html; clear this to fall back to the "VA" text mark
  companyLegalName: "VAV Agency Co., Ltd.",
  companyTaxCode: "",
  companyFounded: "2019",
  companyAddress2: "TP. Hồ Chí Minh, Việt Nam",
  companyRepresentative: "",
  companyScale: "20-50 nhân sự",
  companyField: "Agency Facebook",
  companyImages: [] // array of image URLs — shown as a gallery in the Company Profile section
};
const ADMIN_PASSCODE_DEFAULT = "admin123"; // change this before going live

function loadSettings() {
  try {
    const raw = localStorage.getItem('site_settings');
    if (raw) return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
  } catch (e) { }
  return Object.assign({}, DEFAULT_SETTINGS);
}
function saveSettings(s) {
  try { localStorage.setItem('site_settings', JSON.stringify(s)); } catch (e) { }
}
let settings = loadSettings();

// If the admin panel hasn't set an AI Endpoint URL, and the page is being
// served over http/https (not opened as a local file), assume the API
// lives on this same server at /api/chat — matches the "one deployment"
// setup where gemini-proxy-server.js serves both the site and the API.
function getEffectiveAiBase() {
  if (settings.aiEndpoint) return settings.aiEndpoint.replace(/\/api\/chat\/?$/, '');
  if (location.protocol === 'http:' || location.protocol === 'https:') return location.origin;
  return '';
}
function getEffectiveAiEndpoint() {
  const base = getEffectiveAiBase();
  return base ? base + '/api/chat' : '';
}

function applySettingsToPage() {
  const messengerLinks = [document.getElementById('contactMessengerBtn'), document.getElementById('chatMessengerLink')];
  const telegramLinks = [document.getElementById('contactTelegramBtn'), document.getElementById('chatTelegramLink')];
  const whatsappLinks = [document.getElementById('contactWhatsappBtn'), document.getElementById('chatWhatsappLink')];
  const wechatLinks = [document.getElementById('contactWechatBtn'), document.getElementById('chatWechatLink')];
  messengerLinks.forEach(el => { if (el) el.href = settings.messenger || '#'; });
  telegramLinks.forEach(el => { if (el) el.href = settings.telegram || '#'; });
  whatsappLinks.forEach(el => { if (el) el.href = settings.whatsapp || '#'; });
  wechatLinks.forEach(el => { if (el) el.href = settings.wechat || '#'; });
  const emailEl = document.getElementById('infoEmailVal');
  if (emailEl) emailEl.textContent = settings.email || DEFAULT_SETTINGS.email;
  applyLogo();
  applyCompanyProfile();
  probeAiBackend();
}

function applyCompanyProfile() {
  const map = {
    companyLegalNameVal: settings.companyLegalName,
    companyTaxCodeVal: settings.companyTaxCode,
    companyFoundedVal: settings.companyFounded,
    companyAddressVal2: settings.companyAddress2,
    companyRepVal: settings.companyRepresentative,
    companyScaleVal: settings.companyScale,
    companyFieldVal: settings.companyField
  };
  Object.keys(map).forEach(id => {
    const el = document.getElementById(id);
    if (el && map[id]) el.textContent = map[id];
  });
  const gallery = document.getElementById('companyGallery');
  const emptyHint = document.getElementById('companyGalleryEmpty');
  if (!gallery) return;
  const images = Array.isArray(settings.companyImages) ? settings.companyImages.filter(Boolean) : [];
  gallery.querySelectorAll('a.company-photo').forEach(el => el.remove());
  if (images.length === 0) {
    if (emptyHint) emptyHint.style.display = '';
    return;
  }
  if (emptyHint) emptyHint.style.display = 'none';
  images.forEach(url => {
    const a = document.createElement('a');
    a.className = 'company-photo';
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'VAV Agency';
    img.loading = 'lazy';
    a.appendChild(img);
    gallery.appendChild(a);
  });
}

async function probeAiBackend() {
  const statusEl = document.getElementById('chatStatus');
  if (!statusEl) return;
  const base = getEffectiveAiBase();
  let online = false;
  if (base) {
    try {
      const res = await fetch(base + '/health');
      if (res.ok) {
        const data = await res.json();
        online = !!(data && data.hasKey);
      }
    } catch (e) { /* backend not reachable — stay in FAQ mode */ }
  }
  if (online) {
    statusEl.classList.add('online');
    statusEl.setAttribute('data-i18n', 'chat_status_online');
  } else {
    statusEl.classList.remove('online');
    statusEl.setAttribute('data-i18n', 'chat_status_offline');
  }
  statusEl.textContent = t(statusEl.getAttribute('data-i18n'));
}

function applyLogo() {
  const targets = [
    { img: document.getElementById('logoImgHeader'), fallbackEls: [document.getElementById('logoMarkHeader'), document.getElementById('logoTextHeader')] },
    { img: document.getElementById('logoImgFooter'), fallbackEls: [document.getElementById('logoMarkFooter'), document.getElementById('logoNameFooter')] }
  ];
  targets.forEach(({ img, fallbackEls }) => {
    if (!img) return;
    const showFallback = () => {
      img.style.display = 'none';
      fallbackEls.forEach(el => { if (el) el.style.display = ''; });
    };
    if (settings.logoUrl) {
      img.onerror = showFallback; // bad URL / image failed to load -> fall back to text mark
      img.onload = () => {
        img.style.display = '';
        fallbackEls.forEach(el => { if (el) el.style.display = 'none'; });
      };
      img.src = settings.logoUrl;
    } else {
      showFallback();
    }
  });
}

/* ============ Auto-sync settings from backend /config ============ */
/* If an AI Endpoint is configured (e.g. https://your-server.com/api/chat),
   the same server can also serve GET /config with { messenger, telegram, email }
   sourced from its .env file — so you only have to edit ONE place (the .env
   on the server) instead of the .env AND the admin panel separately.
   If the server or /config is unreachable, the page just keeps using
   whatever is saved in the admin panel / localStorage. */
async function syncSettingsFromServer() {
  const base = getEffectiveAiBase();
  if (!base) return;
  try {
    const res = await fetch(base + '/config');
    if (!res.ok) return;
    const cfg = await res.json();
    let changed = false;
    ['messenger', 'telegram', 'whatsapp', 'wechat', 'email'].forEach(k => {
      if (cfg[k] && cfg[k] !== settings[k]) { settings[k] = cfg[k]; changed = true; }
    });
    if (changed) { saveSettings(settings); applySettingsToPage(); }
  } catch (e) { /* backend not reachable — silently keep local settings */ }
}

/* ============ i18n wiring ============ */
const RTL_LANGS = ['ar'];
let currentLang = 'en';

function t(key) {
  const dict = translations[currentLang] || translations.vi;
  return dict[key] !== undefined ? dict[key] : (translations.en[key] !== undefined ? translations.en[key] : key);
}

function buildLangMenu() {
  const menu = document.getElementById('langMenu');
  if (!menu) return;
  menu.innerHTML = '';
  LANGS.forEach(l => {
    const opt = document.createElement('div');
    opt.className = 'lang-opt' + (l.code === currentLang ? ' active' : '');
    opt.innerHTML = `<span class="lang-flag">${l.flag}</span><span>${l.label}</span>`;
    opt.addEventListener('click', () => { setLang(l.code); document.getElementById('langSwitch').classList.remove('open'); });
    menu.appendChild(opt);
  });
}

function setLang(code) {
  currentLang = code;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const key = el.getAttribute('data-i18n-ph');
    el.setAttribute('placeholder', t(key));
  });
  const langObj = LANGS.find(l => l.code === code) || LANGS[0];
  const flagEl = document.getElementById('langFlag');
  const codeEl = document.getElementById('langCode');
  if (flagEl) flagEl.textContent = langObj.flag;
  if (codeEl) codeEl.textContent = code.toUpperCase();
  document.documentElement.setAttribute('lang', code);
  document.documentElement.setAttribute('dir', RTL_LANGS.includes(code) ? 'rtl' : 'ltr');
  buildLangMenu();
  applySettingsToPage();
  buildQuickReplies();
  try { localStorage.setItem('site_lang', code); } catch (e) { }
}

/* ============ Header / nav ============ */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('year').textContent = new Date().getFullYear();

  document.getElementById('langBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('langSwitch').classList.toggle('open');
  });
  document.addEventListener('click', () => { document.getElementById('langSwitch').classList.remove('open'); });

  document.querySelectorAll('.faq-item').forEach(item => {
    item.querySelector('.faq-q').addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });

  document.getElementById('burgerBtn').addEventListener('click', () => {
    const nav = document.querySelector('.nav-links');
    const isShown = nav.style.display === 'flex';
    nav.style.display = isShown ? 'none' : 'flex';
    if (!isShown) {
      nav.style.cssText += 'position:fixed;top:78px;left:0;right:0;background:#0a1730;flex-direction:column;padding:22px 24px;border-bottom:1px solid rgba(255,255,255,0.09);gap:18px;z-index:99;';
    }
  });

  buildLangMenu();
  let savedLang = 'en';
  try { savedLang = localStorage.getItem('site_lang') || 'en'; } catch (e) { }
  setLang(savedLang);

  initChatWidget();
  initAdminPanel();
  syncSettingsFromServer();
});

/* ============ AI CHAT WIDGET ============ */
const FAQ_RULES = [
  { keys: ['gia', 'price', 'ราคา', '价格', 'giá'], qKey: 'chat_q_price', aKeys: ['q1', 'a1'] },
  { keys: ['bao hanh', 'warranty', '保修', 'ประกัน', 'garanti'], qKey: 'chat_q_warranty', aKeys: ['q1', 'a1'] },
  { keys: ['giao hang', 'delivery', 'ship', 'giao', '交付'], qKey: 'chat_q_delivery', aKeys: ['q2', 'a2'] },
];

function buildQuickReplies() {
  const quickWrap = document.getElementById('chatQuick');
  if (!quickWrap) return;
  quickWrap.innerHTML = '';
  const items = [
    { label: t('chat_q_price'), a: t('a1') },
    { label: t('chat_q_warranty'), a: t('a1') },
    { label: t('chat_q_delivery'), a: t('a2') },
    { label: t('chat_q_contact'), a: null }
  ];
  items.forEach(it => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = it.label;
    btn.addEventListener('click', () => {
      addChatMsg(it.label, 'user');
      if (it.a) { addChatMsg(it.a, 'bot'); }
      else { addChatMsg(t('chat_fallback'), 'bot'); }
    });
    quickWrap.appendChild(btn);
  });
}

function addChatMsg(text, who) {
  const body = document.getElementById('chatBody');
  const div = document.createElement('div');
  div.className = 'chat-msg ' + who;
  div.textContent = text;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

function faqAnswer(userText) {
  const lower = userText.toLowerCase();
  for (const rule of FAQ_RULES) {
    if (rule.keys.some(k => lower.includes(k))) {
      return t(rule.aKeys[1]);
    }
  }
  return null;
}

async function getAiOrFaqReply(userText) {
  const endpoint = getEffectiveAiEndpoint();
  if (endpoint) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText, lang: currentLang })
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.reply) return data.reply;
      }
    } catch (e) { /* network/backend not reachable — fall back below */ }
  }
  const faq = faqAnswer(userText);
  if (faq) return faq;
  return t('chat_fallback');
}

function initChatWidget() {
  const bubble = document.getElementById('chatBubble');
  const panel = document.getElementById('chatPanel');
  const closeBtn = document.getElementById('chatCloseBtn');
  const form = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');

  let greeted = false;
  bubble.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open') && !greeted) {
      addChatMsg(t('chat_greeting'), 'bot');
      buildQuickReplies();
      greeted = true;
    }
  });
  closeBtn.addEventListener('click', () => panel.classList.remove('open'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const val = input.value.trim();
    if (!val) return;
    addChatMsg(val, 'user');
    input.value = '';
    const typing = document.createElement('div');
    typing.className = 'chat-msg bot';
    typing.textContent = '...';
    document.getElementById('chatBody').appendChild(typing);
    const reply = await getAiOrFaqReply(val);
    typing.textContent = reply;
  });
}

/* ============ ADMIN SETTINGS PANEL ============ */
function initAdminPanel() {
  const overlay = document.getElementById('adminOverlay');
  const gearBtn = document.getElementById('adminGearBtn');
  const closeBtn = document.getElementById('adminCloseBtn');
  const lockView = document.getElementById('adminLockView');
  const formView = document.getElementById('adminFormView');
  const passInput = document.getElementById('adminPasscode');
  const unlockBtn = document.getElementById('adminUnlockBtn');
  const saveBtn = document.getElementById('adminSaveBtn');

  gearBtn.addEventListener('click', () => {
    overlay.classList.add('open');
    lockView.style.display = 'block';
    formView.style.display = 'none';
    passInput.value = '';
  });
  closeBtn.addEventListener('click', () => overlay.classList.remove('open'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });

  unlockBtn.addEventListener('click', () => {
    let storedPass = ADMIN_PASSCODE_DEFAULT;
    try { storedPass = localStorage.getItem('admin_passcode') || ADMIN_PASSCODE_DEFAULT; } catch (e) { }
    if (passInput.value === storedPass) {
      lockView.style.display = 'none';
      formView.style.display = 'block';
      document.getElementById('setMessenger').value = settings.messenger || '';
      document.getElementById('setTelegram').value = settings.telegram || '';
      document.getElementById('setWhatsapp').value = settings.whatsapp || '';
      document.getElementById('setWechat').value = settings.wechat || '';
      document.getElementById('setEmail').value = settings.email || '';
      document.getElementById('setCompanyLegalName').value = settings.companyLegalName || '';
      document.getElementById('setCompanyTaxCode').value = settings.companyTaxCode || '';
      document.getElementById('setCompanyFounded').value = settings.companyFounded || '';
      document.getElementById('setCompanyAddress').value = settings.companyAddress2 || '';
      document.getElementById('setCompanyRep').value = settings.companyRepresentative || '';
      document.getElementById('setCompanyScale').value = settings.companyScale || '';
      document.getElementById('setCompanyField').value = settings.companyField || '';
      document.getElementById('setCompanyImages').value = (settings.companyImages || []).join('\n');
      document.getElementById('setAiEndpoint').value = settings.aiEndpoint || '';
      document.getElementById('setLogoUrl').value = settings.logoUrl || '';
    } else {
      passInput.style.borderColor = '#e05252';
      setTimeout(() => { passInput.style.borderColor = ''; }, 900);
    }
  });

  saveBtn.addEventListener('click', () => {
    settings.messenger = document.getElementById('setMessenger').value.trim() || DEFAULT_SETTINGS.messenger;
    settings.telegram = document.getElementById('setTelegram').value.trim() || DEFAULT_SETTINGS.telegram;
    settings.whatsapp = document.getElementById('setWhatsapp').value.trim();
    settings.wechat = document.getElementById('setWechat').value.trim();
    settings.email = document.getElementById('setEmail').value.trim() || DEFAULT_SETTINGS.email;
    settings.companyLegalName = document.getElementById('setCompanyLegalName').value.trim();
    settings.companyTaxCode = document.getElementById('setCompanyTaxCode').value.trim();
    settings.companyFounded = document.getElementById('setCompanyFounded').value.trim();
    settings.companyAddress2 = document.getElementById('setCompanyAddress').value.trim();
    settings.companyRepresentative = document.getElementById('setCompanyRep').value.trim();
    settings.companyScale = document.getElementById('setCompanyScale').value.trim();
    settings.companyField = document.getElementById('setCompanyField').value.trim();
    settings.companyImages = document.getElementById('setCompanyImages').value
      .split('\n').map(s => s.trim()).filter(Boolean);
    settings.aiEndpoint = document.getElementById('setAiEndpoint').value.trim();
    settings.logoUrl = document.getElementById('setLogoUrl').value.trim();
    saveSettings(settings);
    applySettingsToPage();
    overlay.classList.remove('open');
    syncSettingsFromServer();
  });
}
