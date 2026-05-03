// ── CHART.JS GLOBAL DEFAULTS ──────────────────────────────────
Chart.defaults.color = '#3D4F6B';
Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';
Chart.defaults.font.family = "'JetBrains Mono', monospace";
Chart.defaults.font.size = 10;

// ── PRICE COLOR HELPER ────────────────────────────────────────
function priceColor(p, curIdx, i) {
  if (i === curIdx)  return 'rgba(0,245,255,0.9)';
  if (p < -1000)     return 'rgba(167,139,250,0.85)';
  if (p < 400)       return 'rgba(0,229,155,0.8)';
  if (p < 2500)      return 'rgba(255,183,0,0.8)';
  if (p < 3500)      return 'rgba(255,140,66,0.8)';
  if (p < 5000)      return 'rgba(255,71,87,0.85)';
  return 'rgba(185,28,28,0.9)';
}

// ── CONFIG ───────────────────────────────────────────────────
// ── TARIFFNÍ KONSTANTY (sdílené) ─────────────────────────────
let VT_HOURS_SET = new Set([8, 12, 15, 19]);

function loadVtHours() {
  try {
    const saved = JSON.parse(localStorage.getItem('vt_hours') || 'null');
    if (Array.isArray(saved) && saved.length) VT_HOURS_SET = new Set(saved.map(Number));
    const inp = document.getElementById('ns-vt-hours');
    if (inp) inp.value = [...VT_HOURS_SET].sort((a,b)=>a-b).join(', ');
  } catch {}
}

function saveVtHours(str) {
  const hours = str.split(',').map(s => parseInt(s.trim(), 10)).filter(h => !isNaN(h) && h >= 0 && h <= 23);
  if (!hours.length) return;
  VT_HOURS_SET = new Set(hours);
  localStorage.setItem('vt_hours', JSON.stringify([...VT_HOURS_SET]));
  if (priceData) { renderPriceChart(priceChartMode); renderOverview(); }
  if (typeof renderStrategy === 'function' && priceData) renderStrategy();
}
const DIST_VT       = 754.77;
const DIST_NT       = 116.50;
const DG_BUY        = 350;
const DG_SELL       = 450;
const DAN           = 28.30;
const SYST          = 164.24;
const INFRA         = 0;
const POZE_KWH      = 0;
const DPH_MULT      = 1.21;
const DIST_DB = {
  cez:  { D57d: { vt:754.77, nt:116.50 }, D25d: { vt:400, nt:116.50 }, D35d: { vt:550, nt:116.50 } },
  eon:  { D57d: { vt:780,    nt:120    }, D25d: { vt:410, nt:120    }, D35d: { vt:560, nt:120    } },
  pre:  { D57d: { vt:740,    nt:115    }, D25d: { vt:390, nt:115    }, D35d: { vt:540, nt:115    } },
};

const VRM_SITE    = '467894';
const VRM_BASE    = 'https://vrmapi.victronenergy.com/v2';

// Dev: when running on static server (port 3000), proxy API calls to vercel dev (port 3002)
const API_BASE = (window.location.hostname === 'localhost' && window.location.port === '3000')
  ? 'http://localhost:3002'
  : '';

const PRICE_API   = API_BASE + '/api/ote-prices';

// ── STATE ─────────────────────────────────────────────────────
// Globální null-safe setter
const setEl = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };

// XSS-safe HTML escaping for data from external APIs (VRM, OTE-CR)
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Flash při změně hodnoty (přeskočí animaci pokud se text nezměnil)
function flashEl(id, text) {
  const e = document.getElementById(id);
  if (!e || e.textContent === text) return;
  e.textContent = text;
  if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  e.classList.remove('val-flash');
  void e.offsetWidth; // reflow — restartuje animaci
  e.classList.add('val-flash');
}

let priceData     = null;
let fveData       = null;
let solarForecast = null;
let overallStats  = null;
let statPeriod    = 'today';
let priceChart = null;
let priceChartTmr = null;
let fveChart   = null;
let strategyChart = null;
let sparklineChart = null;
let priceChartMode    = 'today';
let strategyChartMode = 'today';
let deferredPrompt = null;

// ── PWA ───────────────────────────────────────────────────────
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredPrompt = e;
  if (!localStorage.getItem('installDismissed'))
    setTimeout(() => { const b=document.getElementById('installBanner'); if(b) b.style.display='block'; }, 2000);
});
const installBtn = document.getElementById('installBtn');
if(installBtn) installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') localStorage.setItem('installDismissed','1');
  deferredPrompt = null;
  document.getElementById('installBanner').style.display = 'none';
});


// ── HELPERS ───────────────────────────────────────────────────
const slotLabel = (h,m) => `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
function levelClass(l) {
  if (!l) return 'medium';
  const s = l.toLowerCase();
  if (s.includes('low')) return 'low';
  if ((s.includes('very')&&s.includes('high'))||s==='veryhigh') return 'vhigh';
  if (s.includes('high')) return 'high';
  return 'medium';
}
function levelLabel(l) {
  const s=(l||'').toLowerCase();
  if (s.includes('low')) return 'Nízká';
  if ((s.includes('very')&&s.includes('high'))||s==='veryhigh') return 'Velmi vysoká';
  if (s.includes('high')) return 'Vysoká';
  return 'Střední';
}
function curSlotIdx(slots) {
  const n=new Date(), hh=n.getHours(), mm=Math.floor(n.getMinutes()/15)*15;
  return slots.findIndex(s=>s.hour===hh&&s.minute===mm);
}
function minMax(slots) {
  let mn=slots[0],mx=slots[0];
  slots.forEach(s=>{ if(s.priceCZK<mn.priceCZK)mn=s; if(s.priceCZK>mx.priceCZK)mx=s; });
  return {mn,mx};
}
// Returns chart axis colors based on current theme
function chartColors() {
  const light = document.documentElement.getAttribute('data-theme') === 'light';
  return {
    tick:     light ? 'rgba(0,0,0,0.45)'  : 'rgba(255,255,255,0.22)',
    grid:     light ? 'rgba(0,0,0,0.07)'  : 'rgba(255,255,255,0.04)',
    tooltip:  light ? 'rgba(255,255,255,0.97)' : 'rgba(10,14,22,0.95)',
    ttTitle:  light ? '#111827' : '#E8EEF8',
    ttBody:   light ? 'rgba(0,0,0,0.55)'  : 'rgba(255,255,255,0.5)',
    ttBorder: light ? 'rgba(0,0,0,0.12)'  : 'rgba(255,255,255,0.1)',
  };
}
function fmtW(w) {
  if (w===null||w===undefined||isNaN(w)) return '—';
  const abs=Math.abs(w);
  if (abs>=1000) return (w/1000).toFixed(2)+' kW';
  return Math.round(w)+' W';
}
function fmtKWh(v) { return v!==null&&!isNaN(v) ? Number(v).toFixed(2)+' kWh' : '—'; }
function decideSlot(price, soc, solarW, cfg) {
  if (price > (cfg.sellAbove??2500)) return { mode:'PRODEJ', icon:'🔴', color:'var(--price-high)' };
  if (price < (cfg.buyBelow??1000)) return { mode:'NÁKUP', icon:'🟢', color:'#00E59B' };
  if (solarW > 500) return { mode:'SOLÁR', icon:'☀️', color:'#FFB700' };
  return { mode:'STANDBY', icon:'⚪', color:'var(--text3)' };
}
function applyConfig() {
  try {
    const cfg = JSON.parse(localStorage.getItem('elektrina_config')||'{}');
    if(cfg.buyBelow !== undefined) { const el=document.getElementById('cfg-buy'); if(el) el.value=cfg.buyBelow; }
    if(cfg.sellAbove !== undefined) { const el=document.getElementById('cfg-sell'); if(el) el.value=cfg.sellAbove; }
    if(cfg.batKwh !== undefined) { const el=document.getElementById('cfg-bat'); if(el) el.value=cfg.batKwh; }
  } catch(e) {}
}
function saveConfig() {
  const get = id => parseFloat(document.getElementById(id)?.value??0);
  localStorage.setItem('elektrina_config', JSON.stringify({
    buyBelow: get('cfg-buy'), sellAbove: get('cfg-sell'), batKwh: get('cfg-bat')
  }));
}
// ── TABS (legacy compat) ─────────────────────────────────────
function switchTab(id, btn) { navTo(id, btn); }

// ── REÁLNÉ CENY (D57d + Delta Green) ─────────────────────────
// D57d ČEZ + Delta Green SPOT — bez POZE (POZE je paušál, ne za kWh)
// NT: (spot + 140.97 + 34.24 + 198.73 + 350) * 1.21 = spot + 723.94 Kč/MWh + DPH
// VT: (spot + 913.27 + 34.24 + 198.73 + 350) * 1.21 = spot + 1496.24 Kč/MWh + DPH

function isVT(hour) {
  // Pokud máme HDO signál z Cerbo GX, použij ho — je přesnější než pevné hodiny
  // HDO closed (true) = NT tarif, HDO open (false) = VT tarif
  if (window._hdoNT !== undefined) return !window._hdoNT;
  // Fallback na pevné hodiny D57d
  return VT_HOURS_SET.has(hour);
}

function realBuyPrice(spotCZK, hour) {
  const dist = isVT(hour) ? DIST_VT : DIST_NT;
  return Math.round((spotCZK + dist + DG_BUY + DAN + SYST + INFRA + POZE_KWH) * DPH_MULT);
}

function realSellPrice(spotCZK) {
  return Math.round(spotCZK - DG_SELL);
}

// ── TÉMA (dark / light) ───────────────────────────────────────
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = next === 'dark' ? '🌙' : '☀️';
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.content = next === 'dark' ? '#0B1120' : '#F1F5F9';
  // Rebuild charts with new theme colors
  if (typeof renderPriceChart === 'function' && priceData) renderPriceChart('today');
  if (typeof renderTomorrowChart === 'function' && priceData?.hoursTomorrow?.length) renderTomorrowChart(priceData.hoursTomorrow);
  if (typeof renderStrategy === 'function' && priceData) renderStrategy();
}

(function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  // button icon updated after DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = saved === 'dark' ? '🌙' : '☀️';
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.content = saved === 'dark' ? '#0B1120' : '#F1F5F9';
  });
})();

