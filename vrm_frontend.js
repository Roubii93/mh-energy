// ── RENDER FVE ────────────────────────────────────────────────
function renderFVE(diagResp, overallResp) {
  const records = diagResp?.records || [];
  const getAll  = code => records.filter(r=>r.code===code);
  const getVal  = (code, fallback=null) => { const r=records.find(r=>r.code===code); return r?r.rawValue:fallback; };
  const getFmt  = (code, fallback='—') => { const r=records.find(r=>r.code===code); return r?.formattedValue??fallback; };

  // ── FVE Solar ──
  const pvpAll = getAll('PVP');
  const solarW = pvpAll.length>0 ? pvpAll.reduce((s,r)=>s+(r.rawValue||0),0) : (getVal('Pdc')??0);
  const ytAll  = getAll('YT');
  const yieldTodayKwh = ytAll.length>0 ? ytAll.reduce((s,r)=>s+(r.rawValue||0),0) : null;
  const yyAll  = getAll('YY');
  const yieldYesterdayKwh = yyAll.length>0 ? yyAll.reduce((s,r)=>s+(r.rawValue||0),0) : null;
  const yuAll  = getAll('YU');
  const yieldTotalKwh = yuAll.length>0 ? yuAll.reduce((s,r)=>s+(r.rawValue||0),0) : null;
  const mcptAll = getAll('MCPT');
  const maxPowerToday = mcptAll.length>0 ? Math.max(...mcptAll.map(r=>r.rawValue||0)) : null;

  // ── Spotřeba & Síť ──
  const o1=getVal('o1')??0, o2=getVal('o2')??0, o3=getVal('o3')??0;
  const loadW = o1+o2+o3;
  const g1=getVal('g1')??0, g2=getVal('g2')??0, g3=getVal('g3')??0;
  const gridW = g1+g2+g3;

  // ── Baterie (JK-BMS) ──
  const batSOC  = getVal('bs')??getVal('SOC');
  const batW    = getVal('bp')??0;
  const batTemp = getVal('bT')??getVal('BT');
  const batSOH  = getVal('SOH');
  const batVolt = getVal('bv')??getVal('V');
  const minCellV = getVal('mcV');
  const maxCellV = getVal('McV');
  const minCellT = getVal('mcT');
  const maxCellT = getVal('McT');
  const batCharged   = getVal('H22'); // kWh celkem nabito
  const batDischarged= getVal('H21'); // kWh celkem vybito
  const modulesOn    = getVal('mon');
  const modulesOff   = getVal('mof');

  // ── EVCS ──
  const evW       = getVal('evp')??0;
  const evState   = records.find(r=>r.code==='eve')?.formattedValue??null;
  const evStatus  = records.find(r=>r.code==='evs')?.formattedValue??null;
  const evSessKwh = getVal('evsE')??null;
  const evMode    = records.find(r=>r.code==='evm')?.formattedValue??null;
  const evMaxI    = getVal('evmc');
  const ev1p      = getVal('ev1p')??0;
  const ev2p      = getVal('ev2p')??0;
  const ev3p      = getVal('ev3p')??0;
  const evTotal   = getVal('evf');

  // ── System state ──
  const sysState  = records.find(r=>r.code==='ss')?.formattedValue??null;

  // ── HDO signál ──
  const hdoState  = records.find(r=>r.code==='dis');
  const hdoVal    = hdoState?.rawValue;
  const hdoFmt    = hdoState?.formattedValue??'—';
  // HDO closed (7) = NT tarif aktivní, open = VT tarif
  const hdoNT     = hdoVal === 7 || hdoFmt === 'closed';

  // ── VE.Bus energy flows ──
  const t3 = getVal('t3')??0; // ACIn1 → AcOut (ze sítě do spotřeby)
  const t5 = getVal('t5')??0; // Inverter → AcIn1 (do sítě)
  const t9 = getVal('t9')??0; // Inverter → AcOut (z baterie do spotřeby)

  const setEl = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };

  // ── Zobrazení FVE ──
  setEl('fvePower', fmtW(solarW));
  const fps = document.getElementById('fvePowerSub');
  if(fps) fps.textContent = solarW>=1000 ? Math.round(solarW)+' W celkem' : '';
  if(yieldTodayKwh!==null) setEl('fveTodayYield', 'Dnes: '+fmtKWh(yieldTodayKwh));

  // ── Zobrazení Spotřeba ──
  setEl('loadPower', fmtW(loadW));
  const ls = document.getElementById('loadSub');
  if(ls) ls.textContent = evW>0 ? `vč. EV ${fmtW(evW)}` : 'W spotřeba';

  // ── Zobrazení Síť ──
  const gridAbs=Math.abs(gridW), fromGrid=gridW>50, toGrid=gridW<-50;
  setEl('gridPower', fmtW(gridAbs));
  const gs=document.getElementById('gridSub');
  if(gs) gs.textContent=fromGrid?'Odběr ze sítě':toGrid?'Přebytek do sítě':'Vyrovnáno';
  const gd=document.getElementById('gridDirection');
  if(gd) gd.textContent=fromGrid?'← Ze sítě':toGrid?'→ Do sítě':'Vyrovnáno';
  const gp=document.getElementById('gridPower');
  if(gp) gp.style.color=fromGrid?'var(--red)':toGrid?'var(--accent)':'var(--blue)';

  // ── Zobrazení Baterie ──
  if(batSOC!==null) {
    setEl('batSOC', Math.round(batSOC)+'%');
    const bar=document.getElementById('batBar');
    if(bar){bar.style.width=batSOC+'%';bar.style.background=batSOC>60?'var(--accent)':batSOC>30?'var(--yellow)':'var(--red)';}
    const charging=batW>50, discharging=batW<-50;
    setEl('batPower', fmtW(Math.abs(batW))+(charging?' ↑ nabíjení':discharging?' ↓ vybíjení':''));
    setEl('batState', charging?'🟢 Nabíjí se':discharging?'🔴 Vybíjí se':'⚪ Standby');
  }
  // Nové hodnoty baterie
  setEl('bat-soh',    batSOH !== null ? batSOH+'%' : '—');
  setEl('bat-temp',   batTemp !== null ? Math.round(batTemp)+'°C' : '—');
  setEl('bat-volt',   batVolt !== null ? batVolt.toFixed(2)+' V' : '—');
  setEl('bat-cellV',  (minCellV&&maxCellV) ? minCellV.toFixed(2)+'–'+maxCellV.toFixed(2)+' V' : '—');
  setEl('bat-cellT',  (minCellT&&maxCellT) ? minCellT+'–'+maxCellT+'°C' : '—');
  setEl('bat-modules', modulesOn!==null ? modulesOn+' online'+(modulesOff>0?' ⚠️ '+modulesOff+' offline':'') : '—');
  if(batCharged!==null) setEl('bat-charged', batCharged.toFixed(1)+' kWh');
  if(batDischarged!==null) setEl('bat-discharged', batDischarged.toFixed(1)+' kWh');
  // Počet cyklů odhad (kapacita ~46.8 kWh)
  const batCapKwh = 46.8;
  if(batCharged!==null) setEl('bat-cycles', Math.round(batCharged/batCapKwh)+' cyklů');

  // ── Zobrazení EVCS ──
  const ep=document.getElementById('ev-power'); if(ep) ep.textContent=fmtW(evW);
  const esSt=document.getElementById('ev-status'); if(esSt) esSt.textContent=evStatus??evState??'—';
  const ess=document.getElementById('ev-session'); if(ess&&evSessKwh!==null) ess.textContent='Session: '+fmtKWh(evSessKwh);
  setEl('ev-mode',   evMode??'—');
  setEl('ev-max-i',  evMaxI!==null ? evMaxI+' A' : '—');
  setEl('ev-l1',     fmtW(ev1p));
  setEl('ev-l2',     fmtW(ev2p));
  setEl('ev-l3',     fmtW(ev3p));
  if(evTotal!==null) setEl('ev-total', evTotal.toFixed(1)+' kWh');

  // ── HDO signál ──
  const hdoEl = document.getElementById('hdo-status');
  if(hdoEl) {
    hdoEl.textContent = hdoNT ? '🟢 NT (levný tarif)' : '🔴 VT (drahý tarif)';
    hdoEl.style.color = hdoNT ? 'var(--accent)' : 'var(--red)';
  }
  // Uložit HDO stav pro VT/NT logiku
  window._hdoNT = hdoNT;

  // ── Statistiky výroby ──
  if(yieldYesterdayKwh!==null) setEl('fve-yesterday', fmtKWh(yieldYesterdayKwh));
  if(yieldTotalKwh!==null)     setEl('fve-total',     (yieldTotalKwh/1000).toFixed(2)+' MWh');
  if(maxPowerToday!==null)     setEl('fve-max-today', fmtW(maxPowerToday));

  // ── System state ──
  setEl('sys-state', sysState??'—');

  updateFlowDiagram(solarW,gridW,loadW,batW,evW);

  // YT diagnostics (součet MPPT) mají přednost — overallstats vrací jiný údaj
  if(yieldTodayKwh!==null){
    setEl('todayYield',fmtKWh(yieldTodayKwh));setEl('fveTodayYield','Dnes: '+fmtKWh(yieldTodayKwh));
    setEl('ov-yield',fmtKWh(yieldTodayKwh));setEl('ov-solar-today','Dnes: '+fmtKWh(yieldTodayKwh));
    // Progress bar výroby dnes vs. odhad ze solárního výhledu
    (function() {
      const bar = document.getElementById('ov-yield-bar');
      const maxEl = document.getElementById('ov-yield-max');
      if (!bar) return;
      let maxKwh = null;
      if (solarForecast?.forecast) {
        const today = new Date().toISOString().slice(0,10);
        maxKwh = solarForecast.forecast
          .filter(f => f.date === today)
          .reduce((s, f) => s + (f.expected_w / 1000), 0);
      }
      if (!maxKwh || maxKwh < 1) maxKwh = (solarForecast?.kwp ?? 15) * 3.5;
      if (!maxKwh || maxKwh < 1) maxKwh = 50;
      const pct = Math.min(100, Math.round(yieldTodayKwh / maxKwh * 100));
      bar.style.width = pct + '%';
      if (maxEl) maxEl.textContent = 'odhad: ' + maxKwh.toFixed(1) + ' kWh';
    })();
  } else if(overallResp?.records) {
    const rec = overallResp.records;
    const totals = rec.today?.totals || rec.totals || rec;
    const kwh = totals.kwh;
    const yk = typeof kwh === 'number' ? kwh : null;
    if(yk!==null){setEl('todayYield',fmtKWh(yk));setEl('fveTodayYield','Dnes: '+fmtKWh(yk));setEl('ov-yield',fmtKWh(yk));setEl('ov-solar-today','Dnes: '+fmtKWh(yk));}
  }
  setTimeout(renderOverview, 50);
}


// ── GRID SETPOINT ─────────────────────────────────────────────
async function setGridSetpoint(watts) {
  const el = document.getElementById('setpointStatus');
  el.textContent = `Nastavuji ${watts > 0 ? '+' : ''}${watts} W...`;
  el.style.color = 'var(--accent)';
  try {
    // Victron Grid setpoint via VRM API - instance 0 is typical for Multiplus II
    const body = { keepAlive: 60, attributes: { '/Settings/CGwacs/AcPowerSetPoint': watts } };
    const r = await fetch(`${API_BASE}/api/vrm?path=${encodeURIComponent(`/installations/${VRM_SITE}/settings`)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (data.success) {
      el.textContent = `✅ Grid setpoint nastaven na ${watts > 0 ? '+' : ''}${watts} W`;
      el.style.color = 'var(--green)';
    } else {
      throw new Error(data.error_message || 'Chyba');
    }
  } catch(e) {
    el.textContent = `⚠️ Setpoint nelze nastavit přes API (${e.message}) — nastav ručně ve Victron VRM`;
    el.style.color = 'var(--orange)';
  }
}

// ── ANIMOVANÝ TOK ENERGIE ─────────────────────────────────────
let flowState = { solarW:0, gridW:0, loadW:0, batW:0, evW:0 };

function updateFlowDiagram(solarW, gridW, loadW, batW, evW) {
  flowState = { solarW, gridW, loadW, batW, evW };
  const s = id => document.getElementById(id);

  // Vždy aktualizuj metriky (i bez SVG diagramu)
  const essTotal2 = solarW + (gridW > 0 ? gridW : 0) + (batW > 0 ? batW : 0);
  const gridLabel2 = gridW < -50 ? '→ ' + fmtW(Math.abs(gridW)) : gridW > 50 ? '← ' + fmtW(gridW) : '≈ 0 W';
  setEl('fb-solar', fmtW(solarW));
  setEl('fb-ess',   fmtW(essTotal2));
  setEl('fb-load',  fmtW(loadW));
  setEl('fb-grid',  gridLabel2);


  if (!s('fn-solar-val')) return;

  s('fn-solar-val').textContent = fmtW(solarW);
  s('fn-grid-val').textContent  = fmtW(Math.abs(gridW));
  s('fn-grid-dir').textContent  = gridW < -50 ? '→ Do sítě' : gridW > 50 ? '← Ze sítě' : 'Vyrovnáno';
  s('fn-grid-val').setAttribute('fill', gridW < -50 ? '#00E59B' : gridW > 50 ? '#FF4757' : '#00F5FF');
  s('fn-load-val').textContent  = fmtW(loadW);
  s('fn-ev-val').textContent    = fmtW(evW);

  const recs = fveData?.records || [];
  const soc  = recs.find(r=>r.code==='bs')?.rawValue ?? recs.find(r=>r.code==='SOC')?.rawValue;
  if (soc != null) {
    s('fn-bat-soc').textContent = Math.round(soc) + '%';
    s('fn-bat-soc').setAttribute('fill', soc>60?'#00E59B':soc>30?'#FFB700':'#FF4757');
  }
  s('fn-bat-pwr').textContent = fmtW(Math.abs(batW)) + (batW>50?' ↑':batW<-50?' ↓':'');

  // ESS power text (součet přes střídač)
  const essTotal = solarW + (gridW > 0 ? gridW : 0) + (batW > 0 ? batW : 0);
  if (s('fn-ess-pwr')) s('fn-ess-pwr').textContent = fmtW(essTotal);

  // Power balance bar
  const gridColor = gridW < -50 ? '#00E59B' : gridW > 50 ? '#FF4757' : '#7A8BA8';
  const gridLabel = gridW < -50 ? '→ ' + fmtW(Math.abs(gridW)) : gridW > 50 ? '← ' + fmtW(gridW) : '≈ 0 W';
  setEl('fb-solar', fmtW(solarW));
  setEl('fb-ess',   fmtW(essTotal));
  setEl('fb-load',  fmtW(loadW));
  setEl('fb-grid',  gridLabel);
  const fbGrid = s('fb-grid');
  if (fbGrid) fbGrid.style.color = gridColor;

  // Barvy a tloušťky linek
  const INACTIVE = '#1a2540';
  const lc = (w, col) => Math.abs(w) > 30 ? col : INACTIVE;
  const sl = (id, w, col) => {
    const l = s(id); if (!l) return;
    l.setAttribute('stroke', lc(w, col));
    l.setAttribute('stroke-width', Math.abs(w) > 30 ? '3' : '1.5');
  };
  sl('fl-solar', solarW,  '#FFB700');
  sl('fl-grid',  gridW,   gridW < 0 ? '#00E59B' : '#FF4757');
  sl('fl-load',  loadW,   '#00E59B');
  sl('fl-bat',   batW,    '#A78BFA');
  sl('fl-ev',    evW,     '#00F5FF');

  renderFlowDots();
}

function renderFlowDots() {
  const container = document.getElementById('flowDots');
  if (!container) return;
  container.innerHTML = '';

  // Bez animací pro uživatele s prefers-reduced-motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const { solarW, gridW, loadW, batW, evW } = flowState;

  const flows = [
    { x1:100, y1:80,  x2:280, y2:155, w:solarW,               color:'#FFB700',                         active:solarW>50 },
    { x1:460, y1:80,  x2:280, y2:155, w:Math.abs(gridW),       color:gridW>50?'#FF4757':'#00E59B',       active:Math.abs(gridW)>50, rev:gridW<0 },
    { x1:280, y1:175, x2:460, y2:265, w:Math.max(0,loadW-evW), color:'#00E59B',                         active:loadW>50 },
    { x1:280, y1:175, x2:100, y2:257, w:Math.abs(batW),        color:'#A78BFA',                         active:Math.abs(batW)>50, rev:batW<0 },
    { x1:460, y1:265, x2:460, y2:275, w:evW,                   color:'#00F5FF',                         active:evW>100 },
  ];

  const NS = 'http://www.w3.org/2000/svg';

  function makeParticle(fl, x1, y1, x2, y2, dur, delay, isHalo) {
    const el = document.createElementNS(NS, 'circle');
    el.setAttribute('r',       isHalo ? '8' : '4');
    el.setAttribute('fill',    fl.color);
    el.setAttribute('opacity', '0');
    if (isHalo) el.setAttribute('filter', 'url(#fp-glow)');

    const am = document.createElementNS(NS, 'animateMotion');
    am.setAttribute('dur',         dur + 's');
    am.setAttribute('repeatCount', 'indefinite');
    am.setAttribute('begin',       delay + 's');
    am.setAttribute('path',        `M${x1},${y1} L${x2},${y2}`);
    el.appendChild(am);

    const ao = document.createElementNS(NS, 'animate');
    ao.setAttribute('attributeName', 'opacity');
    ao.setAttribute('dur',           dur + 's');
    ao.setAttribute('repeatCount',   'indefinite');
    ao.setAttribute('begin',         delay + 's');
    ao.setAttribute('values',        isHalo ? '0;0.18;0.18;0' : '0;0.95;0.95;0');
    ao.setAttribute('keyTimes',      '0;0.1;0.85;1');
    el.appendChild(ao);

    return el;
  }

  flows.forEach(fl => {
    if (!fl.active) return;
    const dur = Math.max(0.8, Math.min(2.5, 3000 / fl.w));
    const n   = Math.max(2, Math.min(6, Math.round(fl.w / 1200)));
    const x1  = fl.rev ? fl.x2 : fl.x1, y1 = fl.rev ? fl.y2 : fl.y1;
    const x2  = fl.rev ? fl.x1 : fl.x2, y2 = fl.rev ? fl.y1 : fl.y2;

    for (let i = 0; i < n; i++) {
      const delay = (i / n) * dur;
      container.appendChild(makeParticle(fl, x1, y1, x2, y2, dur, delay, true));   // halo
      container.appendChild(makeParticle(fl, x1, y1, x2, y2, dur, delay, false));  // dot
    }
  });
}


// ── DIAGNOSTIKA ───────────────────────────────────────────────
let diagAllRecords = [];
let diagCurrentCat = 'all';
let diagCurrentSearch = '';

const DIAG_CATS = {
  ESS:     r => /setpoint|feedin|ess|feed.in|overvoltage|batterylife|minimumsoc/i.test((r.description||'')+(r.code||'')),
  Solar:   r => /solar|mppt|pv |yield|pvp|pdc|yt\b/i.test((r.description||'')+(r.code||'')),
  Battery: r => /battery|bms|soc\b|bs\b|bp\b|state.of.charge/i.test((r.description||'')+(r.code||'')),
  Grid:    r => /grid|ac.input|mains|l1|l2|l3|g1|g2|g3/i.test((r.description||'')+(r.code||'')),
  EV:      r => /ev|charging.station|evcs/i.test((r.description||'')+(r.code||'')),
};

function diagGetCat(r) {
  for(const [cat, fn] of Object.entries(DIAG_CATS)) if(fn(r)) return cat;
  return 'System';
}

const DIAG_CAT_COLORS = {ESS:'var(--blue)',Solar:'var(--yellow)',Battery:'var(--purple)',Grid:'var(--accent)',EV:'var(--orange)',System:'var(--muted)'};

async function loadDiagnostics() {
  const el = document.getElementById('diag-content');
  el.innerHTML = '<div class="empty-state" style="padding:40px;">⏳ Načítám z VRM API...</div>';
  try {
    const data = await fetchVRM(`/installations/${VRM_SITE}/diagnostics?count=1000`);
    diagAllRecords = (data.records || []).map(r => ({...r, _cat: diagGetCat(r)}));
    const statsEl = document.getElementById('diag-stats');
    if(statsEl) statsEl.style.display = '';
    const setEl = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
    setEl('diag-total', diagAllRecords.length);
    setEl('diag-with-val', diagAllRecords.filter(r=>r.rawValue!=null).length);
    setEl('diag-cats', new Set(diagAllRecords.map(r=>r._cat)).size);
    setEl('diag-time', new Date().toLocaleTimeString('cs-CZ'));
    diagRender();
  } catch(e) {
    el.innerHTML = `<div style="color:var(--red);padding:20px;">❌ Chyba: ${e.message}</div>`;
  }
}

function diagFilter(cat, btn) {
  diagCurrentCat = cat;
  document.querySelectorAll('.diag-filter').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  diagRender();
}

function diagSearch(val) {
  diagCurrentSearch = val.toLowerCase();
  diagRender();
}

function diagRender() {
  const filtered = diagAllRecords.filter(r => {
    const catOk = diagCurrentCat === 'all' || r._cat === diagCurrentCat;
    const q = diagCurrentSearch;
    const searchOk = !q || (r.code||'').toLowerCase().includes(q) || (r.description||'').toLowerCase().includes(q) || String(r.rawValue||'').includes(q);
    return catOk && searchOk;
  });
  const grouped = {};
  filtered.forEach(r => { if(!grouped[r._cat]) grouped[r._cat]=[]; grouped[r._cat].push(r); });
  const el = document.getElementById('diag-content');
  if(!filtered.length) { el.innerHTML='<div class="empty-state" style="padding:30px;">Žádné záznamy</div>'; return; }
  el.innerHTML = Object.entries(grouped).sort().map(([cat, recs]) => `
    <div class="diag-section">
      <div class="diag-section-header" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'">
        <div class="diag-section-title">
          <span style="width:8px;height:8px;border-radius:50%;background:${DIAG_CAT_COLORS[escapeHtml(cat)]??'var(--muted)'};display:inline-block;"></span>
          ${escapeHtml(cat)} <span class="diag-count">${recs.length}</span>
        </div>
        <span style="color:var(--muted);font-size:.7rem;">▼</span>
      </div>
      <div style="overflow-x:auto;">
        <table class="diag-table">
          <thead><tr><th>Kód</th><th>Popis</th><th>Hodnota</th><th>Formátovaná</th><th>Jednotka</th><th>Instance</th></tr></thead>
          <tbody>${recs.map(r=>`
            <tr onclick='diagShowDetail(${JSON.stringify(JSON.stringify(r))})'>
              <td><span class="diag-code">${escapeHtml(r.code||'—')}</span></td>
              <td style="color:var(--text2);max-width:280px;">${escapeHtml(r.description||'—')}</td>
              <td><span class="${typeof r.rawValue==='number'?'diag-val-num':r.rawValue==null?'diag-val-null':'diag-val-str'}">${escapeHtml(r.rawValue??'null')}</span></td>
              <td style="color:#22c55e;font-size:.72rem;">${escapeHtml(r.formattedValue||'—')}</td>
              <td style="color:var(--muted);font-size:.7rem;">${escapeHtml(r.unit||'—')}</td>
              <td style="color:var(--muted);font-size:.7rem;">${escapeHtml(r.instance??'—')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`).join('');
}

function diagShowDetail(jsonStr) {
  const r = JSON.parse(jsonStr);
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;max-width:500px;width:90%;max-height:80vh;overflow-y:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div>
          <span style="font-family:'JetBrains Mono',monospace;color:var(--accent);font-size:.9rem;">${r.code}</span>
          <span style="font-size:.75rem;color:var(--muted);margin-left:8px;">${r.description||''}</span>
        </div>
        <button onclick="this.closest('div[style*=fixed]').remove()" style="background:none;border:none;color:var(--muted);font-size:1.2rem;cursor:pointer;">×</button>
      </div>
      <pre style="background:var(--bg);border-radius:8px;padding:12px;font-size:.72rem;overflow-x:auto;color:var(--text);line-height:1.8;">${JSON.stringify(r,null,2)}</pre>
    </div>`;
  overlay.onclick = e => { if(e.target===overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}

function diagExportCSV() {
  if(!diagAllRecords.length) { alert('Nejdřív načti data'); return; }
  const rows = [['Kód','Popis','Hodnota','Formátovaná','Jednotka','Kategorie','Instance']];
  diagAllRecords.forEach(r => rows.push([r.code,r.description,r.rawValue,r.formattedValue,r.unit,r._cat,r.instance]));
  const csv = rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download = `vrm-diagnostics-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

function diagExportJSON() {
  if(!diagAllRecords.length) { alert('Nejdřív načti data'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(diagAllRecords,null,2)],{type:'application/json'}));
  a.download = `vrm-diagnostics-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}


// ── FETCH ─────────────────────────────────────────────────────

// ── STATISTIKY & ROI ──────────────────────────────────────────
async function loadStatistiky() {
  try {
    const data = await fetchVRM(`/installations/${VRM_SITE}/overallstats`);
    overallStats = data.records;
    renderStatistiky();
  } catch(e) {
    console.warn('Overallstats error:', e.message);
  }
}

async function loadGridExportToday() {
  try {
    const now       = Math.floor(Date.now() / 1000);
    const midnight  = now - (now % 86400) - (new Date().getTimezoneOffset() * 60) % 86400;
    const path = `/installations/${VRM_SITE}/stats?type=kwh&start=${midnight}&end=${now}&interval=hours`;
    const data = await fetchVRM(path);
    const t  = data?.totals ?? {};
    const bg = t.Bg ?? 0;  // Battery to grid
    const pg = t.Pg ?? 0;  // PV to grid
    const total = bg + pg;
    const el = document.getElementById('ov-grid-export');
    if (el) {
      el.textContent = total.toFixed(2) + ' kWh';
      el.style.color = total > 0.1 ? 'var(--red)' : 'var(--text3)';
    }
  } catch(e) {
    console.warn('Grid export today error:', e.message);
  }
}

function switchStatPeriod(period, btn) {
  statPeriod = period;
  document.querySelectorAll('#page-statistiky .chart-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderStatistiky();
}

function renderStatistiky() {
  const roi    = document.getElementById('stat-roi-cards');
  const energy = document.getElementById('stat-energy-cards');
  if (!roi || !energy || !overallStats) return;

  const p = overallStats[statPeriod]?.totals || {};
  const solar      = p.total_solar_yield  ?? 0;
  const consump    = p.total_consumption  ?? 0;
  const gridExport = p.grid_history_to    ?? 0;
  const gridImport = p.grid_history_from  ?? 0;
  const selfConsumed = Math.max(0, solar - gridExport);

  // Průměrné ceny z dnešních dat (fallback na typické hodnoty)
  let avgSpot = 1200;
  if (priceData?.hoursToday?.length) {
    avgSpot = priceData.hoursToday.reduce((s, h) => s + h.priceCZK, 0) / priceData.hoursToday.length;
  }
  const buyKwh  = realBuyPrice(Math.max(0, avgSpot), 12) / 1000;
  const sellKwh = Math.max(0, realSellPrice(avgSpot) / 1000);

  const exportEarnings = gridExport    * sellKwh;
  const selfSavings    = selfConsumed  * buyKwh;
  const importCost     = gridImport    * buyKwh;
  const netRoi         = exportEarnings + selfSavings - importCost;

  const periodLabel = { today:'dnes', week:'tento týden', month:'tento měsíc', year:'letos' }[statPeriod];

  roi.innerHTML = `
    <div class="card ca-green">
      <div class="card-label">↑ Výdělek z přetoků</div>
      <div class="card-value sm" style="color:var(--green)">${Math.round(exportEarnings).toLocaleString('cs-CZ')} Kč</div>
      <div class="card-sub">${gridExport.toFixed(1)} kWh × ${sellKwh.toFixed(2)} Kč/kWh</div>
    </div>
    <div class="card ca-blue">
      <div class="card-label">☀️ Úspora ze solárů</div>
      <div class="card-value sm" style="color:var(--cyan)">${Math.round(selfSavings).toLocaleString('cs-CZ')} Kč</div>
      <div class="card-sub">${selfConsumed.toFixed(1)} kWh self-consumed</div>
    </div>
    <div class="card ca-green">
      <div class="card-label">✅ Celkový přínos</div>
      <div class="card-value sm" style="color:var(--green)">${Math.round(netRoi).toLocaleString('cs-CZ')} Kč</div>
      <div class="card-sub">${periodLabel}</div>
    </div>`;

  energy.innerHTML = `
    <div class="card ca-yellow">
      <div class="card-label">☀️ FVE výroba</div>
      <div class="card-value sm" style="color:var(--amber)">${solar.toFixed(1)} kWh</div>
    </div>
    <div class="card ca-blue">
      <div class="card-label">🏠 Spotřeba</div>
      <div class="card-value sm" style="color:var(--cyan)">${consump.toFixed(1)} kWh</div>
    </div>
    <div class="card ca-green">
      <div class="card-label">↑ Export do sítě</div>
      <div class="card-value sm" style="color:var(--green)">${gridExport.toFixed(1)} kWh</div>
    </div>
    <div class="card ca-red">
      <div class="card-label">↓ Import ze sítě</div>
      <div class="card-value sm" style="color:var(--red)">${gridImport.toFixed(1)} kWh</div>
    </div>`;
}

// ── SOLAR FORECAST ────────────────────────────────────────────
async function fetchSolarForecast() {
  try {
    const r = await fetch(API_BASE + '/api/solar-forecast');
    if (!r.ok) return;
    const data = await r.json();
    if (data.success) { solarForecast = data.forecast; renderSolarForecast(); }
  } catch(e) { console.warn('Solar forecast nedostupný:', e.message); }
}

function renderSolarForecast() {
  const section = document.getElementById('solar-forecast-section');
  const cards   = document.getElementById('solar-forecast-cards');
  if (!section || !cards || !solarForecast) return;

  const czNow     = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Prague' }));
  const todayDate = czNow.toISOString().slice(0, 10);
  const nowHour   = czNow.getHours();

  const today = solarForecast.filter(f => f.date === todayDate);
  if (!today.length) return;
  section.style.display = 'block';

  const totalKwh = today.reduce((s, f) => s + f.expected_w / 1000, 0);
  const peak     = today.reduce((mx, f) => f.expected_w > mx.expected_w ? f : mx, today[0]);
  const upcoming = today.filter(f => f.hour >= nowHour).slice(0, 2);

  const col = w => w > 5000 ? 'var(--amber)' : w > 1000 ? 'var(--yellow)' : 'var(--text3)';

  cards.innerHTML = [
    `<div class="card ca-yellow"><div class="card-label">☀️ Dnes celkem</div><div class="card-value sm" style="color:var(--amber)">${totalKwh.toFixed(1)} kWh</div><div class="card-sub">očekávaná výroba</div></div>`,
    `<div class="card ca-yellow"><div class="card-label">⚡ Denní peak</div><div class="card-value sm" style="color:var(--amber)">${(peak.expected_w/1000).toFixed(1)} kW</div><div class="card-sub">v ${String(peak.hour).padStart(2,'0')}:00</div></div>`,
    ...upcoming.map(f => `<div class="card"><div class="card-label">⏱ ${String(f.hour).padStart(2,'0')}:00</div><div class="card-value sm" style="color:${col(f.expected_w)}">${(f.expected_w/1000).toFixed(1)} kW</div><div class="card-sub">${f.radiation_wm2} W/m²</div></div>`)
  ].join('');
}

