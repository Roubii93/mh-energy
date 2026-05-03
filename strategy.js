// ── STRATEGY ─────────────────────────────────────────────────
function renderStrategy() {
  if (!priceData) return;
  const today    = priceData.hoursToday    || [];
  const tomorrow = priceData.hoursTomorrow || [];
  if (!today.length) return;

  // Použij skutečná pravidla z Edge Config (přes localStorage), ne vizuální slidery
  const _r = loadRules();
  const cfg = {
    buyBelow:  _r.socBelow   ?? parseFloat(document.getElementById('cfg-buy')?.value  ?? 1000),
    sellAbove: _r.sellAbove  ?? parseFloat(document.getElementById('cfg-sell')?.value ?? 3500),
    batKwh:    parseFloat(document.getElementById('cfg-bat')?.value ?? 60),
  };

  const recs   = fveData?.records || [];
  const soc    = recs.find(r=>r.code==='bs')?.rawValue ?? recs.find(r=>r.code==='SOC')?.rawValue ?? 50;
  const solarW = recs.filter(r=>r.code==='PVP').reduce((s,r)=>s+(r.rawValue||0),0) || recs.find(r=>r.code==='Pdc')?.rawValue || 0;

  let idx = curSlotIdx(today); if(idx<0) idx=today.length-1;
  const cur = today[idx];
  const dec = decideSlot(cur.priceCZK, soc, solarW, cfg);
  const setEl = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };

  // Decision card
  const dm = document.getElementById('decisionMode');
  const dr = document.getElementById('decisionReason');
  const da = document.getElementById('decisionAction');
  const dc = document.getElementById('decisionCard');
  if(dm) {
    dm.textContent = dec.icon + ' ' + dec.mode;
    dm.style.color = dec.color;
    dm.classList.toggle('mode-standby', dec.mode === 'STANDBY');
  }
  if(dc) {
    dc.style.setProperty('--dec-color', dec.color);
    dc.classList.toggle('standby-active', dec.mode === 'STANDBY');
  }
  if(dr) dr.textContent = `Cena ${cur.priceCZK} Kč/MWh je ${cur.priceCZK >= cfg.sellAbove ? 'nad prahem '+cfg.sellAbove+' Kč. Baterie '+Math.round(soc)+'% — prodávej do sítě přes Grid setpoint.' : cur.priceCZK < cfg.buyBelow ? 'pod prahem '+cfg.buyBelow+' Kč — levná elektřina, nabíjej baterii.' : 'v neutrálním pásmu. Baterie '+Math.round(soc)+'%, standby.'}`;
  if(da) { da.textContent = cur.priceCZK >= cfg.sellAbove ? '→ Nastav Grid setpoint: −7000 W' : cur.priceCZK < cfg.buyBelow ? '→ Nastav Grid setpoint: +5000 W' : '→ Grid setpoint: 0 W (standby)'; da.style.color = dec.color; }

  // Karty
  const sPriceColor = cur.priceCZK < 0 ? 'var(--price-negative)' : cur.priceCZK > 4000 ? 'var(--price-vhigh)' : cur.priceCZK > 2500 ? 'var(--price-high)' : cur.priceCZK < 1000 ? 'var(--price-low)' : 'var(--price-mid)';
  flashEl('s-price',  cur.priceCZK.toLocaleString('cs-CZ')+' Kč');
  const sPriceEl = document.getElementById('s-price'); if(sPriceEl) sPriceEl.style.color = sPriceColor;
  flashEl('s-soc',    Math.round(soc)+'%');
  setEl('s-soc-kwh',  (soc/100*cfg.batKwh).toFixed(1)+' kWh');
  flashEl('s-solar',  fmtW(solarW));
  const allP = today.map(s=>s.priceCZK).sort((a,b)=>a-b);
  const pct  = Math.round(allP.filter(p=>p<=cur.priceCZK).length/allP.length*100);
  flashEl('s-position', pct+'%');
  setEl('s-position-sub', pct<33?'levná hodina':pct>66?'drahá hodina':'střed');

  // Nejlepší okna
  const buy5  = [...today].sort((a,b)=>a.priceCZK-b.priceCZK).slice(0,5);
  const sell5 = [...today].sort((a,b)=>b.priceCZK-a.priceCZK).slice(0,5);
  const bEl = document.getElementById('bestBuySlots');
  const sEl = document.getElementById('bestSellSlots');
  if(bEl)  bEl.innerHTML  = buy5.map(s=>`<div><span style="font-family:'JetBrains Mono',monospace;color:var(--price-low)">${slotLabel(s.hour,s.minute)}</span> — <b>${s.priceCZK}</b> Kč/MWh${s.priceCZK<0?' 🤑':''}</div>`).join('');
  if(sEl)  sEl.innerHTML  = sell5.map(s=>`<div><span style="font-family:'JetBrains Mono',monospace;color:var(--price-high)">${slotLabel(s.hour,s.minute)}</span> — <b>${s.priceCZK}</b> Kč/MWh</div>`).join('');

  if(tomorrow.length) {
    const tb = [...tomorrow].sort((a,b)=>a.priceCZK-b.priceCZK).slice(0,5);
    const ts = [...tomorrow].sort((a,b)=>b.priceCZK-a.priceCZK).slice(0,5);
    const tbe = document.getElementById('tmrBuySlots');
    const tse = document.getElementById('tmrSellSlots');
    if(tbe) tbe.innerHTML = tb.map(s=>`<div><span style="font-family:'JetBrains Mono',monospace;color:var(--accent)">${slotLabel(s.hour,s.minute)}</span> — <b>${s.priceCZK}</b> Kč/MWh</div>`).join('');
    if(tse) tse.innerHTML = ts.map(s=>`<div><span style="font-family:'JetBrains Mono',monospace;color:var(--price-high)">${slotLabel(s.hour,s.minute)}</span> — <b>${s.priceCZK}</b> Kč/MWh</div>`).join('');
  }

  // Arbitráž
  const minP = Math.min(...today.map(s=>s.priceCZK));
  const maxP = Math.max(...today.map(s=>s.priceCZK));
  const minS = today.find(s=>s.priceCZK===minP);
  const maxS = today.find(s=>s.priceCZK===maxP);
  const kwh  = parseFloat(document.getElementById('arb-slider')?.value ?? 60);
  const arb  = Math.round((maxP-minP)/1000*kwh);
  setEl('arb-buy',       minP.toLocaleString('cs-CZ')+' Kč/MWh');
  setEl('arb-buy-time',  minS?slotLabel(minS.hour,minS.minute):'—');
  setEl('arb-sell',      maxP.toLocaleString('cs-CZ')+' Kč/MWh');
  setEl('arb-sell-time', maxS?slotLabel(maxS.hour,maxS.minute):'—');
  setEl('arb-spread',    arb>0?arb.toLocaleString('cs-CZ')+' Kč':'—');
  setEl('arb-kwh',       kwh+' kWh baterie');
  setEl('arb-slider-val',kwh+' kWh');

  // Vykresli graf podle aktuálně zvoleného módu (zachová výběr Dnes/Zítra po refreshi)
  const slotsForChart = strategyChartMode === 'tomorrow' ? (priceData.hoursTomorrow||[]) : today;
  const idxForChart   = strategyChartMode === 'today' ? idx : -1;
  renderStrategyChartFor(slotsForChart, idxForChart, soc, solarW, cfg);

  // Battery plan calculation
  renderBatteryPlan(soc, cfg);
}

function renderBatteryPlan(soc, cfg) {
  const el    = document.getElementById('bat-plan-content');
  const badge = document.getElementById('bat-plan-badge');
  if (!el || !priceData) return;

  const _r            = loadRules();
  // Min SOC: use soc_protect_pct if protection is enabled, otherwise soc_default — both from app settings
  const minSoc        = _r.socProtectEnabled && _r.socProtectPct
                          ? parseFloat(_r.socProtectPct)
                          : parseFloat(_r.socDefault ?? 10);
  const batKwh        = cfg.batKwh ?? 60;
  // Add 1 kW buffer to configured setpoint to account for losses and measurement error
  const SELL_BUFFER_W = 1000;
  const setpointW     = Math.abs(_r.sellSetpoint ?? 7000) + SELL_BUFFER_W;
  const SLOT_H        = 0.25;                        // OTE-CR returns 15-min intervals
  const kwhPerSlot    = setpointW / 1000 * SLOT_H;   // kWh drained per 15-min sell slot
  const NIGHT_KW      = 0.5;                         // average house consumption overnight (kW)
  const FVE_MIN_W     = 500;                         // min PV output to consider FVE active

  // Find tomorrow's FVE start hour from solar forecast
  function getFveStartHour() {
    if (!solarForecast?.forecast) return 7;
    const tmr = new Date(); tmr.setDate(tmr.getDate() + 1);
    const tmrDate = tmr.toISOString().slice(0, 10);
    const slot = solarForecast.forecast.find(s => s.date === tmrDate && s.expected_w >= FVE_MIN_W);
    return slot ? slot.hour : 7;
  }
  const fveStartH = getFveStartHour();

  // Night hours from a given slot end until FVE start next morning
  function nightHoursAfter(slot) {
    const endH = slot.hour + (slot.minute ?? 0) / 60 + SLOT_H;
    if (slot.day === 'dnes') {
      // slot ends tonight → hours until tomorrow morning FVE
      return endH <= fveStartH ? fveStartH - endH : (24 - endH + fveStartH);
    } else {
      // slot is tomorrow → hours remaining until FVE
      return Math.max(0, fveStartH - endH);
    }
  }

  // Available energy above minSoc
  const availableKwh = Math.max(0, (soc - minSoc) / 100 * batKwh);

  // Collect future PRODEJ slots
  const now  = new Date();
  const nowH = now.getHours(), nowMin = now.getMinutes();
  const today    = priceData.hoursToday    || [];
  const tomorrow = priceData.hoursTomorrow || [];
  const sellAbove  = cfg.sellAbove ?? 2500;
  const BONUS_MARGIN = 500; // Kč/MWh — how far below sellAbove to look for bonus slots

  // Primary slots: at or above sellAbove threshold
  const futureSlots = [];
  // Bonus slots: just below sellAbove (sellAbove - BONUS_MARGIN .. sellAbove)
  const bonusSlots  = [];

  today.forEach(s => {
    const sm = s.minute ?? 0;
    if (s.hour > nowH || (s.hour === nowH && sm >= nowMin)) {
      if (s.priceCZK >= sellAbove)
        futureSlots.push({ ...s, day: 'dnes' });
      else if (s.priceCZK >= sellAbove - BONUS_MARGIN)
        bonusSlots.push({ ...s, day: 'dnes' });
    }
  });
  tomorrow.forEach(s => {
    if (s.priceCZK >= sellAbove)
      futureSlots.push({ ...s, day: 'zítra' });
    else if (s.priceCZK >= sellAbove - BONUS_MARGIN)
      bonusSlots.push({ ...s, day: 'zítra' });
  });

  if (!futureSlots.length && !bonusSlots.length) {
    el.innerHTML = '<span style="color:var(--text3);">Žádné plánované přetoky do sítě.</span>';
    if (badge) { badge.textContent = 'bez přetoků'; badge.style.background = 'rgba(100,116,139,0.15)'; badge.style.color = 'var(--text3)'; }
    return;
  }

  // Helper: greedy slot selection respecting night reserve
  function greedySelect(candidates, existingKeys, existingKwh, allSlotsForLastCheck) {
    const keys = new Set(existingKeys);
    let sold = existingKwh;
    const byPrice = [...candidates].sort((a, b) => b.priceCZK - a.priceCZK);

    for (const candidate of byPrice) {
      const key = `${candidate.day}-${candidate.hour}-${candidate.minute ?? 0}`;
      if (keys.has(key)) continue;
      const tentativeSold = sold + kwhPerSlot;

      // Find chronologically last slot across all selected + this candidate
      const allSelected = allSlotsForLastCheck.filter(s =>
        keys.has(`${s.day}-${s.hour}-${s.minute ?? 0}`) || s === candidate
      );
      const lastSlot = allSelected.sort((a, b) => {
        if (a.day !== b.day) return a.day === 'dnes' ? -1 : 1;
        return a.hour !== b.hour ? a.hour - b.hour : (a.minute ?? 0) - (b.minute ?? 0);
      })[allSelected.length - 1];

      const nightKwh = nightHoursAfter(lastSlot) * NIGHT_KW;
      if (availableKwh - tentativeSold >= nightKwh) {
        keys.add(key);
        sold = tentativeSold;
      }
    }
    return { keys, sold };
  }

  // Pass 1: select primary slots (above sellAbove)
  const allSlots = [...futureSlots, ...bonusSlots];
  const pass1 = greedySelect(futureSlots, new Set(), 0, allSlots);
  const selectedKeys = pass1.keys;
  let soldKwh = pass1.sold;

  // Pass 2: if capacity remains and bonus slots are enabled, add bonus slots below sellAbove
  const bonusSlotsEnabled = _r.bonusSlotsEnabled ?? true;
  const bonusKeys = new Set();
  if (bonusSlotsEnabled && bonusSlots.length) {
    const pass2 = greedySelect(bonusSlots, selectedKeys, soldKwh, allSlots);
    soldKwh = pass2.sold;
    // Identify which bonus slots were added
    for (const k of pass2.keys) {
      if (!selectedKeys.has(k)) bonusKeys.add(k);
    }
  }

  const canFitCount    = selectedKeys.size;
  const totalNeededKwh = futureSlots.length * kwhPerSlot;
  const isLimited      = canFitCount < futureSlots.length;
  const bonusCount     = bonusKeys.size;

  // Night reserve for the actual selected set (primary + bonus)
  const allSelectedSlots = allSlots.filter(s =>
    selectedKeys.has(`${s.day}-${s.hour}-${s.minute ?? 0}`) ||
    bonusKeys.has(`${s.day}-${s.hour}-${s.minute ?? 0}`)
  );
  const lastSelected   = allSelectedSlots.length
    ? [...allSelectedSlots].sort((a, b) => {
        if (a.day !== b.day) return a.day === 'dnes' ? -1 : 1;
        return a.hour !== b.hour ? a.hour - b.hour : (a.minute ?? 0) - (b.minute ?? 0);
      })[allSelectedSlots.length - 1]
    : null;
  const nightHours     = lastSelected ? nightHoursAfter(lastSelected) : 0;
  const nightReserveKwh = nightHours * NIGHT_KW;
  const afterSellKwh   = availableKwh - soldKwh;

  // Badge
  if (badge) {
    if (!isLimited) {
      badge.textContent = '✓ baterie vyjde';
      badge.style.background = 'rgba(0,229,155,0.12)';
      badge.style.color = 'var(--green)';
    } else {
      badge.textContent = `⚠ ${canFitCount}/${futureSlots.length} slotů`;
      badge.style.background = 'rgba(255,140,0,0.12)';
      badge.style.color = 'var(--orange)';
    }
  }

  const totalSlots = canFitCount + bonusCount;

  // Summary row
  let html = `
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:12px;">
      <div style="flex:1;min-width:100px;">
        <div style="font-size:.58rem;color:var(--text3);margin-bottom:3px;text-transform:uppercase;letter-spacing:.03em;">Dostupné</div>
        <div style="font-size:1.15rem;font-weight:700;color:var(--accent);font-family:'JetBrains Mono',monospace;">${availableKwh.toFixed(1)} kWh</div>
        <div style="font-size:.6rem;color:var(--text3);margin-top:2px;">${Math.round(soc)}% SOC − ${minSoc}% min SOC × ${batKwh} kWh</div>
      </div>
      <div style="flex:1;min-width:100px;">
        <div style="font-size:.58rem;color:var(--text3);margin-bottom:3px;text-transform:uppercase;letter-spacing:.03em;">Prodej</div>
        <div style="font-size:1.15rem;font-weight:700;color:var(--red);font-family:'JetBrains Mono',monospace;">${soldKwh.toFixed(1)} kWh</div>
        <div style="font-size:.6rem;color:var(--text3);margin-top:2px;">${totalSlots} slotů × ${kwhPerSlot.toFixed(2)} kWh (${(setpointW/1000).toFixed(1)} kW / 15 min vč. ztrát)${bonusCount ? ` · ${bonusCount} bonusové` : ''}</div>
      </div>
      <div style="flex:1;min-width:100px;">
        <div style="font-size:.58rem;color:var(--text3);margin-bottom:3px;text-transform:uppercase;letter-spacing:.03em;">Rezerva na noc</div>
        <div style="font-size:1.15rem;font-weight:700;color:${afterSellKwh >= nightReserveKwh ? 'var(--green)' : 'var(--red)'};font-family:'JetBrains Mono',monospace;">${afterSellKwh.toFixed(1)} kWh</div>
        <div style="font-size:.6rem;color:var(--text3);margin-top:2px;">${nightHours.toFixed(1)} h × 0.5 kW = ${nightReserveKwh.toFixed(1)} kWh potřeba · FVE ~${String(fveStartH).padStart(2,'0')}:00</div>
      </div>
    </div>`;

  // Status message
  if (isLimited) {
    const skipped = futureSlots.length - canFitCount;
    html += `<div style="padding:7px 12px;border-radius:8px;background:rgba(255,140,0,0.07);border:1px solid rgba(255,140,0,0.2);color:var(--orange);font-size:.72rem;margin-bottom:10px;">
      ${skipped} levnějších slotů vynecháno — baterie by nestačila na noční spotřebu
    </div>`;
  } else if (afterSellKwh >= nightReserveKwh) {
    html += `<div style="padding:7px 12px;border-radius:8px;background:rgba(0,229,155,0.07);border:1px solid rgba(0,229,155,0.2);color:var(--green);font-size:.72rem;margin-bottom:10px;">
      Baterie po prodeji pokryje noční spotřebu až do ${String(fveStartH).padStart(2,'0')}:00
    </div>`;
  }

  // Slot pills sorted by time — primary + bonus slots together
  const sortedByTime = [...allSlots].sort((a, b) => {
    if (a.day !== b.day) return a.day === 'dnes' ? -1 : 1;
    return a.hour !== b.hour ? a.hour - b.hour : (a.minute ?? 0) - (b.minute ?? 0);
  });

  html += `<div style="font-size:.6rem;color:var(--text3);margin-bottom:5px;text-transform:uppercase;letter-spacing:.03em;">
    Sloty prodeje
    ${bonusCount ? `<span style="color:#3B82F6;margin-left:6px;">+ ${bonusCount} bonusové pod prahem</span>` : ''}
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:4px;">`;

  sortedByTime.forEach(s => {
    const key       = `${s.day}-${s.hour}-${s.minute ?? 0}`;
    const isPrimary = selectedKeys.has(key);
    const isBonus   = bonusKeys.has(key);
    const isDropped = !isPrimary && !isBonus;
    const timeLabel = `${String(s.hour).padStart(2,'0')}:${String(s.minute??0).padStart(2,'0')}`;
    const dayMark   = s.day === 'zítra' ? '<span style="font-size:.52rem;opacity:.55;margin-left:2px;">zít</span>' : '';

    let bg, color, border, extra = '';
    if (isPrimary) {
      bg = 'rgba(255,71,87,0.12)'; color = 'var(--red)'; border = 'rgba(255,71,87,0.25)';
    } else if (isBonus) {
      bg = 'rgba(59,130,246,0.12)'; color = '#3B82F6'; border = 'rgba(59,130,246,0.30)';
      extra = ' title="Bonus slot — pod prahem prodeje"';
    } else {
      bg = 'rgba(100,116,139,0.07)'; color = 'var(--text3)'; border = 'rgba(100,116,139,0.12)';
      extra = ' style="opacity:0.4;text-decoration:line-through;"';
    }

    html += `<span${extra} style="
      display:inline-flex;align-items:center;gap:2px;padding:4px 7px;border-radius:6px;
      font-family:'JetBrains Mono',monospace;font-size:.7rem;
      background:${bg};color:${color};border:1px solid ${border};
      ${isDropped ? 'opacity:0.4;text-decoration:line-through;' : ''}
    ">${timeLabel}${dayMark} <span style="opacity:.65;font-size:.62rem;">${s.priceCZK}</span></span>`;
  });

  html += '</div>';
  el.innerHTML = html;
}

function switchStrategyChart(mode, btn) {
  strategyChartMode = mode;  // Ulož mód pro příští refresh
  document.querySelectorAll('#page-strategie .chart-tab').forEach(t=>t.classList.remove('active'));
  if(btn) btn.classList.add('active');
  if(!priceData) return;
  const slots = mode==='tomorrow'?(priceData.hoursTomorrow||[]):(priceData.hoursToday||[]);
  if(!slots.length) return;
  const recs   = fveData?.records||[];
  const soc    = recs.find(r=>r.code==='bs')?.rawValue??50;
  const solarW = recs.filter(r=>r.code==='PVP').reduce((s,r)=>s+(r.rawValue||0),0)||0;
  const _r2 = loadRules();
  const cfg = { buyBelow: _r2.socBelow ?? 1000, sellAbove: _r2.sellAbove ?? 3500 };
  renderStrategyChartFor(slots, mode==='today'?curSlotIdx(slots):-1, soc, solarW, cfg);
}

function renderStrategyChartFor(slots, curIdx, soc, solarW, cfg) {
  const ctx = document.getElementById('strategyChart')?.getContext('2d');
  if(!ctx||!slots.length) return;
  if(strategyChart) strategyChart.destroy();
  const labels = slots.map(s=>s.minute===0?slotLabel(s.hour,s.minute):'');
  const prices = slots.map(s=>s.priceCZK);
  const _rChart = loadRules();
  const _bonusSlotsEnabled = _rChart.bonusSlotsEnabled ?? true;
  const BONUS_MARGIN_CHART = 500;
  const colors = slots.map((s,i)=>{
    if(i===curIdx) return 'rgba(0,245,255,0.9)';
    const d=decideSlot(s.priceCZK,soc,solarW,cfg);
    if(d.mode==='PRODEJ') return 'rgba(255,71,87,0.9)';
    if(_bonusSlotsEnabled && s.priceCZK >= (cfg.sellAbove ?? 3500) - BONUS_MARGIN_CHART && s.priceCZK < (cfg.sellAbove ?? 3500) && (curIdx < 0 || i >= curIdx)) return 'rgba(59,130,246,0.85)';
    return d.mode==='NÁKUP'?'rgba(0,229,155,0.9)':d.mode==='SOLÁR'?'rgba(255,183,0,0.85)':'rgba(100,116,139,0.45)';
  });
  const vtIdxStrat = slots.map((s,i) => VT_HOURS_SET.has(s.hour) ? i : -1).filter(i => i >= 0);
  strategyChart = new Chart(ctx,{
    type:'bar',data:{labels,datasets:[{data:prices,backgroundColor:colors,borderRadius:3,borderSkipped:false}]},
    options:{vtIndices:vtIdxStrat,responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{
        title:items=>slotLabel(slots[items[0].dataIndex].hour,slots[items[0].dataIndex].minute),
        label:item=>{ const m=decideSlot(slots[item.dataIndex].priceCZK,soc,solarW,cfg).mode; return [` ${slots[item.dataIndex].priceCZK} Kč/MWh`,` ${m==='STANDBY'?'Solár / baterie':m}`]; }
      },backgroundColor:chartColors().tooltip,titleColor:chartColors().ttTitle,bodyColor:chartColors().ttBody,borderColor:chartColors().ttBorder,borderWidth:1}},
      scales:{x:{grid:{color:chartColors().grid},ticks:{color:chartColors().tick,font:{family:'JetBrains Mono',size:9}}},y:{grid:{color:chartColors().grid},ticks:{color:chartColors().tick,font:{family:'JetBrains Mono',size:9},callback:v=>v+' Kč'}}}}
  });
}

function updateArbSlider() {
  const kwh = parseFloat(document.getElementById('arb-slider')?.value??60);
  const el  = document.getElementById('arb-slider-val');
  if(el) el.textContent = kwh+' kWh';
  renderStrategy();
}

