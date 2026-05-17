// ── PRAVIDLA NODE-RED ─────────────────────────────────────────
const RULES_KEY = 'elektrina_rules';

function loadRules() {
  try { return JSON.parse(localStorage.getItem(RULES_KEY) || '{}'); } catch { return {}; }
}

// Stáhne pravidla ze serveru a synchronizuje localStorage + UI
async function loadRulesFromServer() {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 8000);
  try {
    const resp = await fetch(API_BASE + '/api/get-config', { signal: ctrl.signal });
    if (!resp.ok) return;
    const json = await resp.json();
    if (!json.ok || !json.rules) return;
    const srv   = json.rules;
    const local = loadRules();
    // Server is authoritative — merge all known fields (snake_case → camelCase)
    const merged = {
      ...local,
      feedAbove:         srv.feed_above          ?? local.feedAbove         ?? 1500,
      sellAbove:         srv.sell_above          ?? local.sellAbove         ?? 3500,
      sellSetpoint:      srv.sell_setpoint       ?? local.sellSetpoint      ?? -7200,
      socBelow:          srv.soc_below           ?? local.socBelow          ?? -1000,
      blockVT:           srv.block_vt            !== undefined ? Boolean(srv.block_vt)            : (local.blockVT            ?? true),
      evcsEnabled:       srv.evcs_enabled        !== undefined ? Boolean(srv.evcs_enabled)        : (local.evcsEnabled        ?? true),
      tcEnabled:         srv.tc_enabled          !== undefined ? Boolean(srv.tc_enabled)          : (local.tcEnabled          ?? true),
      bonusSlotsEnabled: srv.bonus_slots_enabled !== undefined ? Boolean(srv.bonus_slots_enabled) : (local.bonusSlotsEnabled  ?? true),
      socProtectEnabled: srv.soc_protect_enabled !== undefined ? Boolean(srv.soc_protect_enabled) : (local.socProtectEnabled ?? false),
      socProtectPct:     srv.soc_protect_pct     ?? local.socProtectPct     ?? 15,
      socDefault:        srv.soc_default         ?? local.socDefault        ?? 10,
    };
    localStorage.setItem(RULES_KEY, JSON.stringify(merged));
    applyRulesUI();
    updateRuleStatus();
  } catch(e) {
    if (e.name !== 'AbortError') console.warn('loadRulesFromServer:', e.message);
  } finally {
    clearTimeout(tid);
  }
}

function saveRules() {
  const g = id => parseFloat(document.getElementById(id)?.value ?? 0);
  const gi = id => parseInt(document.getElementById(id)?.value ?? 0);
  const r = {
    feedAbove:         g('rule-feed-above')       || 1500,
    sellAbove:         g('rule-sell-above')        || 3500,
    sellSetpoint:      gi('rule-sell-setpoint')    || -7000,
    socBelow:          isNaN(g('rule-soc-below')) ? -1000 : g('rule-soc-below'),
    blockVT:           document.getElementById('rule-vt-block')?.checked ?? true,
    socProtectEnabled: document.getElementById('rule-soc-protect')?.checked ?? false,
    socProtectPct:     g('rule-soc-protect-pct')  || 15,
    socDefault:        g('rule-soc-default')       || 10,
    evcsEnabled:       document.getElementById('rule-evcs')?.checked         ?? true,
    tcEnabled:         document.getElementById('rule-tc')?.checked           ?? true,
    bonusSlotsEnabled: document.getElementById('rule-bonus-slots')?.checked  ?? true,
  };
  localStorage.setItem(RULES_KEY, JSON.stringify(r));
  return r;
}

// In-memory password cache — not persisted, cleared on page refresh
let _nrPwdCache = null;

// Password is verified server-side — never stored in client source code
// On localhost: password check is skipped (dev mode)
async function checkNrPassword() {
  if (window.location.hostname === 'localhost') return '__dev__';
  if (_nrPwdCache) return _nrPwdCache;

  const pwd = prompt('🔒 Zadej heslo pro změnu pravidel:');
  if (!pwd) return false;

  try {
    const resp = await fetch(API_BASE + '/api/verify-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd }),
    });
    const data = await resp.json();
    if (data.ok) {
      _nrPwdCache = pwd;
      return pwd;
    }
  } catch(e) {
    console.warn('Password verify error:', e.message);
  }
  alert('❌ Nesprávné heslo');
  return false;
}

async function saveRulesAll() {
  const pwd = await checkNrPassword();
  if (!pwd) return;
  const r = saveRules();
  initApiUrl();
  renderNodeRedJson();

  // Uložit prahy do Edge Config (server) → /data.json bude mít vždy aktuální hodnoty
  const el = document.getElementById('rules-save-status');
  if(el){ el.textContent = '⏳ Ukládám na server...'; el.style.color='var(--yellow)'; }

  fetch(API_BASE + '/api/save-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      password:            pwd,
      feed_above:          r.feedAbove         ?? 1500,
      sell_above:          r.sellAbove         ?? 3500,
      sell_setpoint:       r.sellSetpoint      ?? -7200,
      soc_below:           r.socBelow          ?? -1000,
      block_vt:            r.blockVT           ?? true,
      soc_protect_enabled: r.socProtectEnabled ?? false,
      soc_protect_pct:     r.socProtectPct     ?? 15,
      soc_default:         r.socDefault        ?? 10,
      evcs_enabled:        r.evcsEnabled         ?? true,
      tc_enabled:          r.tcEnabled           ?? true,
      bonus_slots_enabled: r.bonusSlotsEnabled   ?? true,
    })
  })
  .then(res => res.json())
  .then(data => {
    if(el){
      if(data.ok) {
        el.textContent = '✅ Uloženo lokálně i na server · ' + new Date().toLocaleTimeString('cs-CZ');
        el.style.color = 'var(--accent)';
      } else {
        el.textContent = '⚠️ Lokálně uloženo, server: ' + (data.error || 'chyba');
        el.style.color = 'var(--orange)';
        if (data.error === 'Nesprávné heslo') sessionStorage.removeItem('nr_auth');
      }
      setTimeout(() => { if(el) el.textContent=''; }, 4000);
    }
  })
  .catch(() => {
    if(el){ el.textContent = '✅ Uloženo lokálně · server nedostupný'; el.style.color='var(--orange)'; setTimeout(()=>{el.textContent='';},3000); }
  });

  updateRuleStatus();
}

function applyRulesUI() {
  const r = loadRules();
  const set = (id, v) => { const el=document.getElementById(id); if(el) el.value=v; };
  set('rule-feed-above',      r.feedAbove      ?? 1500);
  set('rule-sell-above',      r.sellAbove      ?? 3500);
  set('rule-sell-setpoint',   r.sellSetpoint   ?? -7000);
  set('rule-soc-below',       r.socBelow       ?? -1000);
  set('rule-soc-protect-pct', r.socProtectPct  ?? 15);
  set('rule-soc-default',     r.socDefault     ?? 10);
  // VT toggle — výchozí BLOKOVÁNO (true)
  const vtBlocked = r.blockVT ?? true;
  const cb = document.getElementById('rule-vt-block');
  if(cb) cb.checked = vtBlocked;
  updateVtToggleUI(vtBlocked);
  // SOC protect toggle — výchozí VYPNUTO (false)
  const spEnabled = r.socProtectEnabled ?? false;
  const spCb = document.getElementById('rule-soc-protect');
  if(spCb) spCb.checked = spEnabled;
  updateSocProtectToggleUI(spEnabled);
  const sv = document.getElementById('rule-sell-setpoint-val');
  if(sv) sv.textContent = (r.sellSetpoint ?? -7000).toLocaleString('cs-CZ') + ' W';
  const sad = document.getElementById('rule-sell-above-display');
  if(sad) sad.textContent = r.sellAbove ?? 3500;
  const spd = document.getElementById('rule-soc-protect-pct-display');
  if(spd) spd.textContent = (r.socProtectPct ?? 15) + '%';
  const sdv = document.getElementById('rule-soc-default-val');
  if(sdv) sdv.textContent = (r.socDefault ?? 10) + '%';
  const sddesc = document.getElementById('soc-default-desc');
  if(sddesc) sddesc.textContent = r.socDefault ?? 10;
  // Zařízení — výchozí ZAPNUTO
  const evcsCb = document.getElementById('rule-evcs');
  if(evcsCb) evcsCb.checked = r.evcsEnabled ?? true;
  updateEvcsToggleUI(r.evcsEnabled ?? true);
  const tcCb = document.getElementById('rule-tc');
  if(tcCb) tcCb.checked = r.tcEnabled ?? true;
  updateTcToggleUI(r.tcEnabled ?? true);
  const bsCb = document.getElementById('rule-bonus-slots');
  if(bsCb) bsCb.checked = r.bonusSlotsEnabled ?? true;
  updateBonusSlotsToggleUI(r.bonusSlotsEnabled ?? true);
}

function toggleVtBlock() {
  const cb = document.getElementById('rule-vt-block');
  if(cb) { cb.checked = !cb.checked; updateVtToggleUI(cb.checked); saveRules(); updateRuleStatus(); }
}

function updateVtToggleUI(blocked) {
  const bg  = document.getElementById('vt-toggle-bg');
  const dot = document.getElementById('vt-toggle-dot');
  const lbl = document.getElementById('vt-toggle-label');
  if(bg)  bg.style.background  = blocked ? '#ef444440' : 'var(--surface2)';
  if(bg)  bg.style.borderColor = blocked ? '#ef4444'   : 'var(--border)';
  if(dot) { dot.style.background = blocked ? '#ef4444' : 'var(--muted)'; dot.style.left = blocked ? '25px' : '3px'; }
  if(lbl) { lbl.textContent = blocked ? 'BLOKOVÁNO' : 'POVOLENO'; lbl.style.color = blocked ? '#ef4444' : 'var(--muted)'; }
}

function toggleSocProtect() {
  const cb = document.getElementById('rule-soc-protect');
  if(cb) { cb.checked = !cb.checked; updateSocProtectToggleUI(cb.checked); saveRules(); updateRuleStatus(); }
}

function updateSocProtectToggleUI(enabled) {
  const bg  = document.getElementById('soc-protect-toggle-bg');
  const dot = document.getElementById('soc-protect-toggle-dot');
  const lbl = document.getElementById('soc-protect-toggle-label');
  const col = '#f97316'; // orange
  if(bg)  { bg.style.background  = enabled ? col+'40' : 'var(--surface2)'; bg.style.borderColor = enabled ? col : 'var(--border)'; }
  if(dot) { dot.style.background = enabled ? col : 'var(--muted)'; dot.style.left = enabled ? '25px' : '3px'; }
  if(lbl) { lbl.textContent = enabled ? 'ZAPNUTO' : 'VYPNUTO'; lbl.style.color = enabled ? col : 'var(--muted)'; }
}

function toggleEvcs() {
  const cb = document.getElementById('rule-evcs');
  if(cb) { cb.checked = !cb.checked; updateEvcsToggleUI(cb.checked); saveRules(); updateRuleStatus(); }
}

function updateEvcsToggleUI(on) {
  const bg  = document.getElementById('evcs-toggle-bg');
  const dot = document.getElementById('evcs-toggle-dot');
  const lbl = document.getElementById('evcs-toggle-label');
  const col = on ? '#00E59B' : '#ef4444';
  if(bg)  { bg.style.background  = on ? 'rgba(0,229,155,.15)' : 'rgba(239,68,68,.15)'; bg.style.borderColor = col; }
  if(dot) { dot.style.background = col; dot.style.left = on ? '25px' : '3px'; }
  if(lbl) { lbl.textContent = on ? 'ZAPNUTO' : 'VYPNUTO'; lbl.style.color = col; }
}

function toggleTc() {
  const cb = document.getElementById('rule-tc');
  if(cb) { cb.checked = !cb.checked; updateTcToggleUI(cb.checked); saveRules(); updateRuleStatus(); }
}

function updateTcToggleUI(on) {
  const bg  = document.getElementById('tc-toggle-bg');
  const dot = document.getElementById('tc-toggle-dot');
  const lbl = document.getElementById('tc-toggle-label');
  const col = on ? '#00E59B' : '#ef4444';
  if(bg)  { bg.style.background  = on ? 'rgba(0,229,155,.15)' : 'rgba(239,68,68,.15)'; bg.style.borderColor = col; }
  if(dot) { dot.style.background = col; dot.style.left = on ? '25px' : '3px'; }
  if(lbl) { lbl.textContent = on ? 'ZAPNUTO' : 'VYPNUTO'; lbl.style.color = col; }
}

function toggleBonusSlots() {
  const cb = document.getElementById('rule-bonus-slots');
  if(cb) { cb.checked = !cb.checked; updateBonusSlotsToggleUI(cb.checked); saveRules(); updateRuleStatus(); }
}

function updateBonusSlotsToggleUI(on) {
  const bg  = document.getElementById('bonus-slots-toggle-bg');
  const dot = document.getElementById('bonus-slots-toggle-dot');
  const lbl = document.getElementById('bonus-slots-toggle-label');
  const col = '#3B82F6'; // blue
  if(bg)  { bg.style.background  = on ? 'rgba(59,130,246,.15)' : 'var(--surface2)'; bg.style.borderColor = on ? col : 'var(--border)'; }
  if(dot) { dot.style.background = on ? col : 'var(--muted)'; dot.style.left = on ? '25px' : '3px'; }
  if(lbl) { lbl.textContent = on ? 'ZAPNUTO' : 'VYPNUTO'; lbl.style.color = on ? col : 'var(--muted)'; }
}

function setRuleSP(v) {
  const el  = document.getElementById('rule-sell-setpoint');
  const val = document.getElementById('rule-sell-setpoint-val');
  if(el)  el.value = v;
  if(val) val.textContent = v.toLocaleString('cs-CZ') + ' W';
  saveRules(); updateRuleStatus();
}

// Vypočítá JSON lokálně z pravidel a aktuálního spotu (bez volání serveru)
async function renderNodeRedJson() {
  const el = document.getElementById('api-json');
  if(!el) return;

  // Vezmi aktuální prahy z localStorage
  const r = loadRules();
  const params = new URLSearchParams({
    feed_above:    r.feedAbove    ?? 1500,
    sell_above:    r.sellAbove    ?? 3500,
    sell_setpoint: r.sellSetpoint ?? -7000,
    soc_below:     r.socBelow     ?? -1000,
    _t:            Math.floor(Date.now() / 60000)
  });

  // Přidej aktuální spot z appky
  if (priceData) {
    const today = priceData.hoursToday || [];
    let idx = curSlotIdx(today); if(idx<0) idx=today.length-1;
    if (today[idx]) params.set('spot_czk', today[idx].priceCZK);
  }

  try {
    el.innerHTML = '<span style="color:var(--muted)">Načítám z endpointu...</span>';
    const resp = await fetch(`${API_BASE}/api/data?${params.toString()}`);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const json = await resp.json();

    // Ulož prahy do data.json endpointu přes URL — zobraz výsledek
    const jsonStr = JSON.stringify(json, null, 2);
    el.innerHTML = jsonStr
      .replace(/"([^"]+)":/g,     '<span style="color:#c084fc">"$1"</span>:')
      .replace(/: (-?\d+)/g,      ': <span style="color:#fbbf24">$1</span>')
      .replace(/: (true|false)/g, ': <span style="color:#4ade80">$1</span>')
      .replace(/: "([^"]+)"/g,    ': <span style="color:#38bdf8">"$1"</span>');
  } catch(e) {
    el.innerHTML = `<span style="color:var(--red)">Chyba: ${e.message}</span>`;
  }
}

function updateRuleStatus() {
  if (!priceData) return;
  const today = priceData.hoursToday || [];
  if (!today.length) return;
  let idx = curSlotIdx(today); if(idx<0) idx=today.length-1;
  const spot = today[idx].priceCZK;
  const r = loadRules();
  const feedAbove         = r.feedAbove         ?? 1500;
  const sellAbove         = r.sellAbove         ?? 3500;
  const sellSetpoint      = r.sellSetpoint      ?? -7000;
  const socBelow          = r.socBelow          ?? -1000;
  const socProtectEnabled = r.socProtectEnabled ?? false;
  const socProtectPct     = r.socProtectPct     ?? 15;
  const socDefault        = r.socDefault        ?? 10;

  const el = id => document.getElementById(id);
  const hh4 = new Date().getHours();
  const vtNow = VT_HOURS_SET.has(hh4);
  const vtBlocked = r.blockVT ?? true;

  // ── Pomocník pro status badge ──────────────────────────────
  function setBadge(id, text, color) {
    const b = el(id); if(!b) return;
    b.textContent = text; b.style.color = color;
    b.style.borderColor = color === 'var(--muted)' ? 'var(--border)' : color;
  }
  // ── Barevná nr-tile dlaždice ──────────────────────────────
  function setNrTile(tileId, text, stateClass, textColor) {
    const tile = document.getElementById(tileId); if(!tile) return;
    tile.className = 'nr-tile ' + stateClass;
    const v = tile.querySelector('.nr-tile-val'); if(v){ v.textContent = text; v.style.color = textColor || ''; }
  }

  // Pravidlo 1: block_export
  const active1 = spot > feedAbove;
  const s1 = el('rule1-status');
  if(s1) {
    s1.textContent = active1 ? '🔵 POVOLENO — ' + spot + ' > ' + feedAbove : '🔴 BLOKOVÁNO — ' + spot + ' ≤ ' + feedAbove;
    s1.style.color = active1 ? 'var(--blue)' : 'var(--red)';
  }
  setBadge('rsb-1', active1 ? 'POVOLENO' : 'BLOKOVÁNO', active1 ? 'var(--blue)' : 'var(--red)');
  setNrTile('nr-tile-1', active1 ? 'POVOLENO' : 'BLOKOVÁNO', active1 ? 's-info' : 's-off', active1 ? 'var(--cyan)' : 'var(--muted)');

  // Pravidlo 2/3: grid_setpoint
  const selling = spot > sellAbove;
  const s2 = el('rule2-status');
  if(s2) {
    s2.textContent = selling ? '🔴 PRODEJ — setpoint ' + sellSetpoint.toLocaleString('cs-CZ') + ' W' : '⚪ STANDBY — setpoint −50 W';
    s2.style.color = selling ? 'var(--red)' : 'var(--muted)';
    const sad = el('rule-sell-above-display'); if(sad) sad.textContent = sellAbove;
  }
  setBadge('rsb-2', selling ? 'PRODEJ ' + sellSetpoint.toLocaleString('cs-CZ') + 'W' : 'STANDBY', selling ? 'var(--red)' : 'var(--muted)');
  setNrTile('nr-tile-2', selling ? 'PRODEJ' : 'STANDBY', selling ? 's-sell' : 's-off', selling ? 'var(--red)' : 'var(--muted)');

  // Pravidlo 3b: SOC ochrana při prodeji
  const s3b = el('rule3b-status');
  let rsb3bText = 'VYPNUTO', rsb3bCol = 'var(--muted)';
  if(s3b) {
    if(!socProtectEnabled) {
      s3b.textContent = '⚪ VYPNUTO'; s3b.style.color = 'var(--muted)';
    } else if(selling) {
      s3b.textContent = '🟠 AKTIVNÍ — sleduj SOC · limit ' + socProtectPct + '%'; s3b.style.color = 'var(--orange)';
      rsb3bText = 'SOC ' + socProtectPct + '%'; rsb3bCol = 'var(--orange)';
    } else {
      s3b.textContent = '⚪ STANDBY — prodej neběží'; s3b.style.color = 'var(--muted)';
      rsb3bText = 'STANDBY'; rsb3bCol = 'var(--muted)';
    }
  }
  setBadge('rsb-3b', rsb3bText, rsb3bCol);

  // Pravidlo 4: setup_SOC
  const s4 = el('rule4-status');
  const nabij = !vtNow && spot < socBelow;
  let rsb4Text = 'NT ' + socDefault + '%', rsb4Col = 'var(--muted)';
  if(s4) {
    if(vtNow) {
      s4.textContent = '🔴 VT → SOC ' + socDefault + '%'; s4.style.color = 'var(--red)';
      rsb4Text = 'VT ' + socDefault + '%'; rsb4Col = 'var(--red)';
    } else if(nabij) {
      s4.textContent = '🟣 NABÍJENÍ — SOC 100%'; s4.style.color = 'var(--purple)';
      rsb4Text = 'NABÍJENÍ 100%'; rsb4Col = 'var(--purple)';
    } else {
      s4.textContent = '⚪ NT výchozí — SOC ' + socDefault + '%'; s4.style.color = 'var(--muted)';
    }
  }
  setBadge('rsb-4', rsb4Text, rsb4Col);

  // Pravidlo 5: VT blokace
  const s5 = el('rule5-status');
  if(s5) {
    s5.textContent = vtNow ? (vtBlocked ? '🔴 BLOKOVÁNO — VT ' + hh4 + ':00' : '🟢 POVOLENO — VT vypnuto') : '⚪ NT — nákup povolen';
  }
  setBadge('rsb-5', vtNow ? (vtBlocked ? 'BLOKOVÁNO' : 'POVOLENO') : 'NT', vtNow ? (vtBlocked ? 'var(--red)' : 'var(--green)') : 'var(--muted)');

  // Zařízení: EVCS
  const evcsOn = r.evcsEnabled ?? true;
  const tcOn   = r.tcEnabled   ?? true;
  const devEl = id => el(id);
  const evcsStatus = devEl('rule-evcs-status');
  if(evcsStatus) { evcsStatus.textContent = evcsOn ? '🟢 NABÍJÍ' : '🔴 VYPNUTO'; evcsStatus.style.color = evcsOn ? 'var(--green)' : 'var(--red)'; }
  setBadge('rsb-evcs', evcsOn ? 'ZAPNUTO' : 'VYPNUTO', evcsOn ? 'var(--green)' : 'var(--red)');
  setNrTile('nr-tile-evcs', evcsOn ? 'ZAPNUTO' : 'VYPNUTO', evcsOn ? 's-ok' : 's-off', evcsOn ? 'var(--green)' : 'var(--muted)');

  // Zařízení: TČ
  const tcStatus = devEl('rule-tc-status');
  if(tcStatus) { tcStatus.textContent = tcOn ? '🟢 BĚŽÍ' : '🔴 BLOKOVÁNO'; tcStatus.style.color = tcOn ? 'var(--green)' : 'var(--red)'; }
  setBadge('rsb-tc', tcOn ? 'ZAPNUTO' : 'BLOKOVÁNO', tcOn ? 'var(--green)' : 'var(--red)');
  setNrTile('nr-tile-tc', tcOn ? 'ZAPNUTO' : 'BLOKOVÁNO', tcOn ? 's-ok' : 's-off', tcOn ? 'var(--green)' : 'var(--muted)');

  renderNodeRedJson();
}

function renderNodeRed() {
  if (!priceData) return;
  const today = priceData.hoursToday || [];
  if (!today.length) return;
  const hh  = new Date().getHours();
  let idx   = curSlotIdx(today); if(idx<0) idx=today.length-1;
  const cur = today[idx];
  const spot = cur.priceCZK;
  const buyP  = realBuyPrice(spot, hh);
  const sellP = realSellPrice(spot);
  const tariff = isVT(hh) ? 'VT' : 'NT';
  const el = id => document.getElementById(id);

  // Top karty
  if(el('nr-spot'))      el('nr-spot').textContent = spot.toLocaleString('cs-CZ');
  if(el('nr-buy-price')) el('nr-buy-price').textContent = buyP.toLocaleString('cs-CZ');
  if(el('nr-buy-tariff'))el('nr-buy-tariff').textContent = tariff + ' · spot ' + spot.toLocaleString('cs-CZ') + ' Kč/MWh';
  if(el('nr-sell-price'))el('nr-sell-price').textContent = sellP.toLocaleString('cs-CZ');

  // Nejlepší okna
  const buySlots  = [...today].map(s=>({...s,rb:realBuyPrice(s.priceCZK,s.hour)})).sort((a,b)=>a.rb-b.rb).slice(0,5);
  const sellSlots = [...today].map(s=>({...s,rs:realSellPrice(s.priceCZK)})).sort((a,b)=>b.rs-a.rs).slice(0,5);
  if(el('nr-best-buy'))  el('nr-best-buy').innerHTML  = buySlots.map(s=>`<div><span style="font-family:'JetBrains Mono',monospace;color:var(--accent)">${slotLabel(s.hour,s.minute)}</span> — <b>${s.rb.toLocaleString('cs-CZ')}</b> Kč/MWh <span style="color:var(--muted);font-size:.65rem;">(spot ${s.priceCZK}${s.priceCZK<0?' 🤑':''})</span></div>`).join('');
  if(el('nr-best-sell')) el('nr-best-sell').innerHTML = sellSlots.map(s=>`<div><span style="font-family:'JetBrains Mono',monospace;color:var(--price-high)">${slotLabel(s.hour,s.minute)}</span> — <b>${s.rs.toLocaleString('cs-CZ')}</b> Kč/MWh <span style="color:var(--muted);font-size:.65rem;">(spot ${s.priceCZK})</span></div>`).join('');

  // Rozklad ceny (Nastavení záložka)
  const dist = isVT(hh) ? DIST_VT : DIST_NT;
  const baseSum = spot + dist + DG_BUY + DAN + SYST + INFRA + POZE_KWH;
  const rows = [['Spot cena',spot,'var(--blue)'],[`Distribuce (${tariff})`,dist,'var(--text)'],['Delta Green',DG_BUY,'var(--text)'],['Daň z elektřiny',DAN,'var(--muted)'],['Syst. služby',SYST,'var(--muted)'],['Infrastruktura',INFRA,'var(--muted)'],['POZE',POZE_KWH,'var(--muted)'],['Mezisoučet',Math.round(baseSum),'var(--text)'],['DPH 21%',Math.round(baseSum*.21),'var(--muted)'],['CELKEM',buyP,'var(--red)']];
  const bdHtml = rows.map(([l,v,c])=>`<div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--border)20;padding:4px 0;"><span style="color:var(--muted);font-size:.78rem;">${l}</span><span style="color:${c};font-family:'JetBrains Mono',monospace;font-size:.78rem;font-weight:${l==='CELKEM'?700:400}">${typeof v==='number'?v.toLocaleString('cs-CZ'):v} Kč/MWh</span></div>`).join('');
  if(el('price-breakdown')) el('price-breakdown').innerHTML = bdHtml;
  if(el('ns-spot-val'))     el('ns-spot-val').textContent = spot.toLocaleString('cs-CZ');

  applyRulesUI();
  updateRuleStatus();
  initApiUrl();
}

const NS_KEY = 'elektrina_nastaveni';

// Distribuční sazby — ceny bez DPH v Kč/MWh
// Zdroj: faktury + zpětný výpočet (VT = jednosložkové, nebo VT/NT kde je dvousložkové)
function onDistributorChange() {
  onTariffChange();
  saveNastaveni();
}

function onTariffChange() {
  const dist = document.getElementById('ns-distributor')?.value ?? 'cez';
  const tariff = document.getElementById('ns-tariff')?.value ?? 'D57d';
  const db = DIST_DB[dist]?.[tariff];
  if (!db) return;
  document.getElementById('ns-dist-vt').value = db.vt;
  document.getElementById('ns-dist-nt').value = db.nt ?? '';
  document.getElementById('ns-dist-vt-hint').textContent = db.hint;
  document.getElementById('ns-dist-nt-hint').textContent = db.nt ? `NT tarif platí mimo VT hodiny` : 'Jednosložková sazba — NT nevyplňuj';
  saveNastaveni();
}

function toggleEvSection() {
  const hasEv = document.getElementById('ns-has-ev')?.checked;
  const evSec = document.getElementById('ns-ev-section');
  if (evSec) evSec.style.display = hasEv ? 'block' : 'none';
}

function resetNastaveni() {
  if (confirm('Obnovit výchozí nastavení?')) {
    localStorage.removeItem(NS_KEY);
    loadNastaveni();
    onTariffChange();
  }
}

function getNastaveni() {
  try { return JSON.parse(localStorage.getItem(NS_KEY) || '{}'); } catch { return {}; }
}
const OV_KEY = 'elektrina_override';

function loadOverride() {
  try {
    const ov = JSON.parse(localStorage.getItem(OV_KEY) || 'null');
    if (!ov) return null;
    // Zkontroluj platnost
    if (ov.expires && Date.now() > ov.expires) {
      localStorage.removeItem(OV_KEY);
      return null;
    }
    return ov;
  } catch { return null; }
}

function initOverrideUI() {
  const ov = loadOverride();
  const active = ov !== null;
  setOverrideToggle(active);
  if (active) {
    document.getElementById('ov-setpoint').value = ov.grid_setpoint ?? 0;
    document.getElementById('ov-soc').value = ov.setup_SOC ?? 10;
    setBlockExportUI(ov.block_export ?? false);
    updateOverridePreview();
    showOverrideStatus(ov);
  }
}

function setOverrideToggle(active) {
  const track = document.getElementById('override-track');
  const thumb = document.getElementById('override-thumb');
  const fields = document.getElementById('override-fields');
  if (!track) return;
  if (active) {
    track.style.background = 'var(--accent)';
    thumb.style.transform = 'translateX(20px)';
    fields.style.opacity = '1';
    fields.style.pointerEvents = 'auto';
  } else {
    track.style.background = 'var(--border)';
    thumb.style.transform = 'translateX(0)';
    fields.style.opacity = '0.4';
    fields.style.pointerEvents = 'none';
  }
}

function toggleMasterOverride() {
  const ov = loadOverride();
  if (ov) {
    clearOverride();
  } else {
    // Aktivuj s aktuálními hodnotami slideru
    saveOverride();
  }
}

function updateOverridePreview() {
  const sp  = parseInt(document.getElementById('ov-setpoint')?.value ?? 0);
  const soc = parseInt(document.getElementById('ov-soc')?.value ?? 10);
  document.getElementById('ov-setpoint-val').textContent = (sp >= 0 ? '+' : '') + sp + ' W';
  document.getElementById('ov-setpoint-val').style.color = sp < 0 ? 'var(--red)' : sp > 0 ? 'var(--green)' : 'var(--muted)';
  document.getElementById('ov-soc-val').textContent = soc + ' %';
  document.getElementById('ov-soc-val').style.color = soc >= 80 ? 'var(--green)' : soc <= 20 ? 'var(--red)' : 'var(--purple)';
}

let _blockExport = false;
function toggleBlockExport() {
  _blockExport = !_blockExport;
  setBlockExportUI(_blockExport);
}
function setBlockExportUI(val) {
  _blockExport = val;
  const track = document.getElementById('ov-export-track');
  const thumb = document.getElementById('ov-export-thumb');
  const label = document.getElementById('ov-export-label');
  if (!track) return;
  if (val) {
    track.style.background = 'var(--orange)';
    thumb.style.transform = 'translateX(20px)';
    label.textContent = 'true';
    label.style.color = 'var(--orange)';
  } else {
    track.style.background = 'var(--border)';
    thumb.style.transform = 'translateX(0)';
    label.textContent = 'false';
    label.style.color = 'var(--green)';
  }
}

function setOvSetpoint(v) {
  document.getElementById('ov-setpoint').value = v;
  updateOverridePreview();
}
function setOvSOC(v) {
  document.getElementById('ov-soc').value = v;
  updateOverridePreview();
}

function saveOverride() {
  const sp       = parseInt(document.getElementById('ov-setpoint').value ?? 0);
  const soc      = parseInt(document.getElementById('ov-soc').value ?? 10);
  const duration = parseInt(document.getElementById('ov-duration').value ?? 0);
  const expires  = duration > 0 ? Date.now() + duration * 60 * 1000 : null;

  const ov = {
    active:        true,
    grid_setpoint: sp,
    block_export:  _blockExport,
    setup_SOC:     soc,
    saved_at:      new Date().toISOString(),
    expires
  };
  localStorage.setItem(OV_KEY, JSON.stringify(ov));
  setOverrideToggle(true);
  showOverrideStatus(ov);

  // Okamžitě refresh test endpointu pokud je otevřený
  const preview = document.getElementById('api-preview');
  if (preview.style.display !== 'none') testApiEndpoint();
}

function clearOverride() {
  localStorage.removeItem(OV_KEY);
  setOverrideToggle(false);
  document.getElementById('ov-status').textContent = '↺ Obnoveno automatické řízení';
  document.getElementById('ov-status').style.color = 'var(--muted)';
}

function showOverrideStatus(ov) {
  const el = document.getElementById('ov-status');
  const exp = ov.expires ? ` · platí do ${new Date(ov.expires).toLocaleTimeString('cs-CZ')}` : ' · platí dokud nezrušíš';
  el.innerHTML = `✅ Aktivní: setpoint <b>${ov.grid_setpoint >= 0 ? '+' : ''}${ov.grid_setpoint} W</b>, SOC <b>${ov.setup_SOC}%</b>, block_export <b>${ov.block_export}</b>${exp}`;
  el.style.color = 'var(--green)';
}
function getApiUrl(includeSpot = false, includeTimestamp = false) {
  const base = `${API_BASE || window.location.origin}/api/data`;
  const r = loadRules();
  const params = {
    feed_above:    r.feedAbove    ?? 1500,
    sell_above:    r.sellAbove    ?? 3500,
    sell_setpoint: r.sellSetpoint ?? -7000,
    soc_below:     r.socBelow     ?? -1000,
  };
  if (includeSpot && priceData) {
    const today = priceData.hoursToday || [];
    let idx = curSlotIdx(today); if(idx<0) idx=today.length-1;
    if (today[idx]) params.spot_czk = today[idx].priceCZK;
  }
  // Timestamp zabrání CDN cache — každá minuta = unikátní URL
  if (includeTimestamp) {
    params._t = Math.floor(Date.now() / 60000); // mění se každou minutu
  }
  return `${base}?${new URLSearchParams(params).toString()}`;
}

function initApiUrl() {
  const shortUrl = `${window.location.origin}/data.json`;
  const el   = document.getElementById('api-url');
  const link = document.getElementById('api-url-link');
  if(el)   el.textContent  = shortUrl;
  if(link) { link.textContent = shortUrl; link.href = shortUrl; }
  initOverrideUI();
}

function copyApiUrl(btnEl) {
  const shortUrl = `${window.location.origin}/data.json`;
  navigator.clipboard.writeText(shortUrl).then(() => {
    const btn = btnEl || event?.target;
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = '✅ Zkopírováno!';
    btn.style.color = 'var(--green)';
    setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 2000);
  });
}

async function testApiEndpoint() {
  const preview = document.getElementById('api-preview');
  const jsonEl  = document.getElementById('api-json');
  preview.style.display = 'block';
  jsonEl.textContent = 'Načítám...';
  jsonEl.style.color  = 'var(--muted)';
  try {
    const r    = await fetch(getApiUrl(true, true));  // spot + timestamp = vždy čerstvé
    const data = await r.json();
    const json = JSON.stringify(data, null, 2);
    jsonEl.innerHTML = json
      .replace(/"([^"]+)":/g,      '<span style="color:#b388ff">"$1"</span>:')
      .replace(/: (-?\d+\.?\d*)/g, ': <span style="color:#ffd600">$1</span>')
      .replace(/: (true|false)/g,  ': <span style="color:#00e676">$1</span>')
      .replace(/: "([^"]+)"/g,     ': <span style="color:#00d4ff">"$1"</span>');
    jsonEl.style.color = 'var(--text)';
    // url se aktualizuje v initApiUrl
  } catch(e) {
    jsonEl.textContent = 'Chyba: ' + e.message;
    jsonEl.style.color = 'var(--red)';
  }
}

// ── PRAVIDLA NODE-RED ─────────────────────────────────────────










// Vypočítá JSON lokálně z pravidel a aktuálního spotu (bez volání serveru)




// Distribuční sazby — ceny bez DPH v Kč/MWh
// Zdroj: faktury + zpětný výpočet (VT = jednosložkové, nebo VT/NT kde je dvousložkové)



function loadNastaveni() {
  try {
    const ns = JSON.parse(localStorage.getItem(NS_KEY) || '{}');
    const set = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) { if (el.type === 'checkbox') el.checked = val; else el.value = val; } };
    set('ns-distributor',   ns.distributor   ?? 'cez');
    set('ns-tariff',        ns.tariff        ?? 'D57d');
    set('ns-dist-vt',       ns.distVt        ?? 2248);
    set('ns-dist-nt',       ns.distNt        ?? '');
    set('ns-fuse',          ns.fuse          ?? '25');
    set('ns-fuse-fee',      ns.fuseFee       ?? 605);
    set('ns-trader-name',   ns.traderName    ?? 'Delta Green');
    set('ns-trader-tariff', ns.traderTariff  ?? 'Spot s výkupem FVE');
    set('ns-buy-markup',    ns.buyMarkup     ?? 350);
    set('ns-sell-markup',   ns.sellMarkup    ?? 450);
    set('ns-monthly-fee',   ns.monthlyFee    ?? 129);
    set('ns-dph',           ns.dph           ?? 21);
    set('ns-pv-kwp',        ns.pvKwp         ?? 15);
    set('ns-bat-kwh',       ns.batKwh        ?? 60);
    set('ns-min-soc',       ns.minSoc        ?? 0);
    set('ns-max-setpoint',  ns.maxSetpoint   ?? 7000);
    set('ns-vrm-id',        ns.vrmId         ?? '467894');
    set('ns-inverter',      ns.inverter      ?? 'multiplus2');
    set('ns-phases',        ns.phases        ?? '3');
    set('ns-mppt-count',    ns.mpptCount     ?? '3');
    set('ns-has-ev',        ns.hasEv         ?? true);
    set('ns-has-tc',        ns.hasTc         ?? false);
    set('ns-has-boiler',    ns.hasBoiler     ?? false);
    set('ns-has-spot-sell', ns.hasSpotSell   ?? true);
    set('ns-ev-brand',      ns.evBrand       ?? 'victron');
    set('ns-ev-max-kw',     ns.evMaxKw       ?? 22);
    set('ns-buy-below',     ns.buyBelow      ?? 3500);
    set('ns-sell-above',    ns.sellAbove     ?? 2500);
    toggleEvSection();
    // Aktualizuj stav notifikací
    if (typeof updateNotifStatus === 'function') updateNotifStatus();
  } catch(e) { console.warn('Nastavení load error:', e); }
}

function saveNastaveni() {
  const get  = id => document.getElementById(id)?.value;
  const getB = id => document.getElementById(id)?.checked ?? false;
  const ns = {
    distributor: get('ns-distributor'),  tariff: get('ns-tariff'),
    distVt: parseFloat(get('ns-dist-vt')||2248),
    distNt: get('ns-dist-nt') ? parseFloat(get('ns-dist-nt')) : null,
    fuse: get('ns-fuse'), fuseFee: parseFloat(get('ns-fuse-fee')||605),
    traderName: get('ns-trader-name'), traderTariff: get('ns-trader-tariff'),
    buyMarkup: parseFloat(get('ns-buy-markup')||350),
    sellMarkup: parseFloat(get('ns-sell-markup')||450),
    monthlyFee: parseFloat(get('ns-monthly-fee')||129),
    dph: parseFloat(get('ns-dph')||21),
    pvKwp: parseFloat(get('ns-pv-kwp')||15),
    batKwh: parseFloat(get('ns-bat-kwh')||60),
    minSoc: parseFloat(get('ns-min-soc')||0),
    maxSetpoint: parseFloat(get('ns-max-setpoint')||7000),
    vrmId: get('ns-vrm-id'), inverter: get('ns-inverter'),
    phases: get('ns-phases'), mpptCount: get('ns-mppt-count'),
    hasEv: getB('ns-has-ev'), hasTc: getB('ns-has-tc'),
    hasBoiler: getB('ns-has-boiler'), hasSpotSell: getB('ns-has-spot-sell'),
    evBrand: get('ns-ev-brand'), evMaxKw: parseFloat(get('ns-ev-max-kw')||22),
    buyBelow: parseFloat(get('ns-buy-below')||3500),
    sellAbove: parseFloat(get('ns-sell-above')||2500),
  };
  localStorage.setItem(NS_KEY, JSON.stringify(ns));
  return ns;
}

function saveNastaveniAll() {
  saveNastaveni();
  const el = document.getElementById('ns-save-status');
  el.textContent = '✅ Uloženo — ' + new Date().toLocaleTimeString('cs-CZ');
  el.style.color = 'var(--green)';
  setTimeout(() => el.textContent = '', 3000);
}
















// ── GRID SETPOINT ─────────────────────────────────────────────








