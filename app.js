// ── FETCH ─────────────────────────────────────────────────────

// Returns current date in CZ timezone as YYYY-MM-DD — changes at CZ midnight
function czDateToday() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Prague' }));
  return d.toISOString().slice(0, 10);
}

async function fetchPrices() {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 10000);
  try {
    // Append today's CZ date so browser cache is busted at midnight
    const r = await fetch(PRICE_API + '?d=' + czDateToday(), { signal: ctrl.signal });
    if (!r.ok) throw new Error('Ceny: HTTP ' + r.status);
    return r.json();
  } catch(e) {
    throw new Error(e.name === 'AbortError' ? 'Ceny: timeout (10 s)' : e.message);
  } finally {
    clearTimeout(tid);
  }
}
async function fetchVRM(path) {
  const r = await fetch(`${API_BASE}/api/vrm?path=${encodeURIComponent(path)}`);
  if (!r.ok) throw new Error('VRM: HTTP '+r.status);
  return r.json();
}

// ── REFRESH ALL ───────────────────────────────────────────────


// ── REFRESH ALL ───────────────────────────────────────────────
async function refreshAll() {
  const btn  = document.getElementById('refreshBtn');
  const icon = document.getElementById('refreshIcon');
  if(btn)  btn.classList.add('loading');
  if(icon) { icon.textContent = '↻'; icon.classList.add('rotating'); }

  try {
    const [prices, diag] = await Promise.allSettled([
      fetchPrices(),
      fetchVRM(`/installations/${VRM_SITE}/diagnostics?count=1000`),
    ]);

    if (prices.status === 'fulfilled') {
      priceData = prices.value;
      // If data was generated on a different CZ day, hoursTomorrow is stale — drop it
      if (priceData.hoursTomorrow?.length && priceData.generatedAt) {
        const generatedCZDate = new Date(priceData.generatedAt)
          .toLocaleDateString('sv', { timeZone: 'Europe/Prague' }); // sv → YYYY-MM-DD
        if (generatedCZDate !== czDateToday()) {
          priceData.hoursTomorrow = [];
        }
      }
      renderPrices(priceData);
      if (priceData.source === 'standby') {
        showStandbyBanner(priceData.ote_error);
        updateStatus('standby');
      } else {
        hideStandbyBanner();
        updateStatus(true);
      }
    }
    if (diag.status === 'fulfilled') {
      fveData = diag.value;
      renderFVE(diag.value, null);
    }

    renderStrategy();
    setTimeout(renderOverview, 100);

    // Solar forecast + statistiky — nezávisle, neblokují hlavní refresh
    fetchSolarForecast();
    loadStatistiky();
    loadGridExportToday();

    // Zkontroluj notifikace po každém refreshi
    setTimeout(() => checkNotifications(priceData, fveData, loadRules()), 500);

  } catch(e) {
    updateStatus(false);
  } finally {
    if(btn)  btn.classList.remove('loading');
    if(icon) { icon.classList.remove('rotating'); icon.textContent = '↻'; }
  }
}

// ── COUNTDOWN ────────────────────────────────────────────────
const REFRESH_SEC = 15;
let _countdown = REFRESH_SEC;
let _countdownTimer = null;

function startCountdown() {
  _countdown = REFRESH_SEC;
  clearInterval(_countdownTimer);
  _countdownTimer = setInterval(() => {
    _countdown--;
    const num   = document.getElementById('countdownNum');
    const circ  = document.getElementById('countdownCircle');
    const label = document.getElementById('countdownLabel');
    if (num)   { num.textContent = _countdown; num.style.color = _countdown <= 5 ? 'var(--orange)' : 'var(--accent)'; }
    if (circ)  circ.setAttribute('stroke-dashoffset', 56.5 * (1 - _countdown / REFRESH_SEC));
    if (label) label.textContent = _countdown + 's';
    if (_countdown <= 0) { _countdown = REFRESH_SEC; refreshAll(); }
  }, 1000);
}

// ── START ─────────────────────────────────────────────────────
loadVtHours();         // načti VT hodiny z localStorage
loadRulesFromServer(); // synchronizuj pravidla ze serveru při startu
refreshAll();
applyConfig();
initApiUrl();
loadNastaveni();
startCountdown();

// ── SIDEBAR ───────────────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').style.display =
    document.getElementById('sidebar').classList.contains('open') ? 'block' : 'none';
}
function dismissInstall() {
  document.getElementById('installBanner').style.display = 'none';
  localStorage.setItem('installDismissed','1');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').style.display = 'none';
}

// ── NAVIGATION ────────────────────────────────────────────────
function navTo(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.bn-tab').forEach(n => n.classList.remove('active'));
  const page = document.getElementById('page-' + id);
  if (page) page.classList.add('active');
  if (el) el.classList.add('active');
  closeSidebar();
  // Trigger renders
  if (id === 'ceny' && priceData) setTimeout(() => renderPriceChart(priceChartMode), 50);
  if (id === 'strategie') setTimeout(() => renderStrategy(), 50);
  if (id === 'nodered') setTimeout(() => renderNodeRed(), 50);
  if (id === 'statistiky') setTimeout(() => { if(!overallStats) loadStatistiky(); else renderStatistiky(); }, 50);
  if (id === 'nastaveni') setTimeout(() => { loadNastaveni(); onTariffChange(); }, 50);
  if (id === 'prehled') setTimeout(() => renderOverview(), 50);
  if (id === 'wizard') setTimeout(() => initWizard(), 50);
}

// Override old switchTab

// ── LAST UPDATE ───────────────────────────────────────────────
function updateStatus(state) {
  const dot     = document.getElementById('liveDot');
  const txt     = document.getElementById('liveStatus');
  const pill    = document.getElementById('tb-status-pill');

  // Update pill CSS class
  if (pill) {
    pill.classList.remove('status-error', 'status-standby', 'status-loading');
    if (state === 'standby')    pill.classList.add('status-standby');
    else if (!state)            pill.classList.add('status-error');
  }

  if (state === 'standby') {
    if (dot) dot.style.background = 'var(--amber)';
    if (txt) txt.textContent = 'Standby · bez cen OTE';
  } else if (state) {
    if (dot) dot.style.background = 'var(--green)';
    if (txt) txt.textContent = 'Živá data · ' + new Date().toLocaleTimeString('cs-CZ');
  } else {
    if (dot) dot.style.background = 'var(--red)';
    if (txt) txt.textContent = 'Chyba načtení';
  }
  setTimeout(renderOverview, 50);
}

// ── STANDBY BANNER ────────────────────────────────────────────
function showStandbyBanner(detail) {
  const banner = document.getElementById('standby-banner');
  if (!banner) return;
  const msg = banner.querySelector('#standby-msg');
  if (msg) msg.textContent = detail ? `OTE-CR: ${detail}` : 'Data spot cen nejsou dostupná.';
  banner.style.display = 'flex';
}

function hideStandbyBanner() {
  const banner = document.getElementById('standby-banner');
  if (banner) banner.style.display = 'none';
}

// ══════════════════════════════════════════════════════════════
// WIZARD
// ══════════════════════════════════════════════════════════════
const WIZARD_CFG_KEY  = 'wizard_config';
const WIZARD_DONE_KEY = 'wizard_completed';
let _wizardStep = 1;
const WIZARD_TOTAL = 5;

function initWizard() {
  const saved = JSON.parse(localStorage.getItem(WIZARD_CFG_KEY) || 'null');
  if (saved) _applyWizardSaved(saved);
  _renderWizardStep();
  wizardLoadLibrary();
}

function _applyWizardSaved(s) {
  const set = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.value = v; };
  const selOpt = (group, val) => {
    document.querySelectorAll(`.wizard-opt[data-group="${group}"]`).forEach(o => {
      o.classList.toggle('selected', o.dataset.val === String(val));
    });
  };
  selOpt('inverter', s.inverter);
  selOpt('phase', s.phase);
  selOpt('tariff_dist', s.tariff);
  selOpt('strategie', s.strategy);
  set('wiz-kwp', s.fve_kwp);
  set('wiz-kwh', s.bat_kwh);
  set('wiz-jistic', s.jistic);
  set('wiz-vt', s.price_vt);
  set('wiz-nt', s.price_nt);
  set('wiz-markup', s.price_markup);
  set('wiz-soc-min', s.soc_min);
  set('wiz-soc-max', s.soc_max);
  set('wiz-buy-below', s.buy_below);
  set('wiz-sell-above', s.sell_above);
  set('wiz-grid-setpoint', s.grid_setpoint);
  if (s.devices && Array.isArray(s.devices)) {
    document.querySelectorAll('.wiz-check[data-group="device"]').forEach(c => {
      c.classList.toggle('selected', s.devices.includes(c.dataset.val));
    });
  }
}

function _renderWizardStep() {
  document.querySelectorAll('.wizard-panel').forEach(p => p.classList.remove('active'));
  for (let i = 1; i <= WIZARD_TOTAL; i++) {
    const dot = document.getElementById('wsd-' + i);
    if (!dot) continue;
    dot.classList.toggle('active', i === _wizardStep);
    dot.classList.toggle('done', i < _wizardStep);
  }
  const panel = document.getElementById('wiz-step-' + _wizardStep);
  if (panel) panel.classList.add('active');

  const prevBtn = document.getElementById('wiz-prev');
  const nextBtn = document.getElementById('wiz-next');
  const progEl  = document.getElementById('wiz-progress');
  if (prevBtn) prevBtn.style.display = _wizardStep === 1 ? 'none' : 'inline-flex';
  if (nextBtn) nextBtn.textContent = _wizardStep === WIZARD_TOTAL ? '✅ Dokončit' : 'Pokračovat →';
  if (progEl)  progEl.textContent = `Krok ${_wizardStep} z ${WIZARD_TOTAL}`;

  if (_wizardStep === WIZARD_TOTAL) wizardGenerateFlow();
}

function wizardNext() {
  if (_wizardStep < WIZARD_TOTAL) {
    _wizardStep++;
    _renderWizardStep();
  } else {
    wizardSave();
    localStorage.setItem(WIZARD_DONE_KEY, '1');
  }
}

function wizardPrev() {
  if (_wizardStep > 1) { _wizardStep--; _renderWizardStep(); }
}

function wizardGoTo(step) {
  _wizardStep = Math.max(1, Math.min(WIZARD_TOTAL, step));
  _renderWizardStep();
}

function wizardSelectOpt(groupName, el) {
  el.closest('.card, .wizard-panel')
    .querySelectorAll(`.wizard-opt[data-group="${groupName}"]`)
    .forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  if (groupName === 'strategie') _wizardToggleCustom();
}

function wizardToggleCheck(el) {
  el.classList.toggle('selected');
}

function _wizardToggleCustom() {
  const sel = document.querySelector('.wizard-opt.selected[data-group="strategie"]');
  const custom = document.getElementById('wiz-custom-params');
  if (custom) custom.style.display = (sel && sel.dataset.val === 'custom') ? 'block' : 'none';
}

function wizardGetConfig() {
  const v    = id => (document.getElementById(id) || {}).value || '';
  const selV = group => {
    const el = document.querySelector(`.wizard-opt.selected[data-group="${group}"]`);
    return el ? el.dataset.val : null;
  };
  const checks = group => [...document.querySelectorAll(`.wiz-check.selected[data-group="${group}"]`)].map(e => e.dataset.val);
  return {
    inverter:       selV('inverter') || 'multiplus2',
    fve_kwp:        parseFloat(v('wiz-kwp'))    || 10,
    bat_kwh:        parseFloat(v('wiz-kwh'))    || 10,
    phase:          selV('phase')    || '3f',
    jistic:         parseInt(v('wiz-jistic'))   || 25,
    tariff:         selV('tariff_dist') || 'D57',
    price_vt:       parseFloat(v('wiz-vt'))     || 5.5,
    price_nt:       parseFloat(v('wiz-nt'))     || 3.2,
    price_markup:   parseFloat(v('wiz-markup')) || 1.2,
    sell_price:     parseFloat(v('wiz-sellprice')) || 1.5,
    devices:        checks('device'),
    strategy:       selV('strategie') || 'balanced',
    soc_min:        parseInt(v('wiz-soc-min'))       || 20,
    soc_max:        parseInt(v('wiz-soc-max'))       || 95,
    buy_below:      parseFloat(v('wiz-buy-below'))   || 3.0,
    sell_above:     parseFloat(v('wiz-sell-above'))  || 6.0,
    grid_setpoint:  parseInt(v('wiz-grid-setpoint')) || 50,
  };
}

function wizardSave() {
  localStorage.setItem(WIZARD_CFG_KEY, JSON.stringify(wizardGetConfig()));
}

