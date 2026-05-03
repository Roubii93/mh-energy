// ── RENDER PRICES ─────────────────────────────────────────────
function renderPrices(data) {
  const today = data.hoursToday || [];
  const tomorrow = data.hoursTomorrow || [];
  if (!today.length) return;

  let idx = curSlotIdx(today); if(idx<0) idx=today.length-1;
  const cur = today[idx];
  const lc = levelClass(cur.level);

  const setEl = (id, val) => { const el=document.getElementById(id); if(el) el.textContent=val; };
  const setClass = (id, cls) => { const el=document.getElementById(id); if(el) el.className=cls; };

  const priceColor = cur.priceCZK < 0 ? 'var(--price-negative)' : cur.priceCZK > 4000 ? 'var(--price-vhigh)' : cur.priceCZK > 2500 ? 'var(--price-high)' : cur.priceCZK < 1000 ? 'var(--price-low)' : 'var(--price-mid)';
  ['currentCZK','fve-currentCZK'].forEach(id => { flashEl(id, cur.priceCZK+' Kč'); const e=document.getElementById(id); if(e) e.style.color=priceColor; });
  ['currentEUR','fve-currentEUR'].forEach(id => setEl(id, cur.priceEur.toFixed(2)+' EUR/MWh'));
  ['currentLevel','fve-currentLevel'].forEach(id => {
    const el=document.getElementById(id); if(!el) return;
    el.textContent = levelLabel(cur.level);
    el.className = `badge badge-${lc}`;
  });

  const {mn,mx} = minMax(today);
  flashEl('minCZK', mn.priceCZK+' Kč'); setEl('minEUR', mn.priceEur.toFixed(2)+' EUR/MWh'); setEl('minTime', '⏰ '+slotLabel(mn.hour,mn.minute));
  flashEl('maxCZK', mx.priceCZK+' Kč'); setEl('maxEUR', mx.priceEur.toFixed(2)+' EUR/MWh'); setEl('maxTime', '⏰ '+slotLabel(mx.hour,mx.minute));

  // Next 4 slots
  const next4 = [];
  for(let i=1;i<=8;i++){if(idx+i<today.length)next4.push({slot:today[idx+i],isT:false});}
  if(next4.length<8&&tomorrow.length){let ti=0;while(next4.length<8&&ti<tomorrow.length)next4.push({slot:tomorrow[ti++],isT:true});}
  const ns = document.getElementById('nextSlots');
  if(ns) ns.innerHTML = next4.map(({slot,isT})=>{
    const lc2=levelClass(slot.level);
    const tmrLabel = isT ? ' <span style="font-size:.60rem;font-weight:600;color:var(--sell);opacity:.8;">zítra</span>' : '';
    return `<div class="slot lvl-${lc2}"><div class="slot-time">${slotLabel(slot.hour,slot.minute)}${tmrLabel}</div><div class="slot-price lvl-${lc2}">${slot.priceCZK} Kč</div><div class="slot-eur">${slot.priceEur.toFixed(2)} EUR</div></div>`;
  }).join('');

  // Tomorrow
  const tmrChartSec = document.getElementById('tomorrowChartSection');
  const tmrEmptySec = document.getElementById('tomorrowEmptySection');
  if(tomorrow.length) {
    if(tmrChartSec) tmrChartSec.style.display='block';
    if(tmrEmptySec) tmrEmptySec.style.display='none';
    renderTomorrowChart(tomorrow);
    const {mn:tMn,mx:tMx}=minMax(tomorrow);
    setEl('tMinCZK',tMn.priceCZK+' Kč');setEl('tMinEUR',tMn.priceEur.toFixed(2)+' EUR/MWh');setEl('tMinTime','⏰ '+slotLabel(tMn.hour,tMn.minute));
    setEl('tMaxCZK',tMx.priceCZK+' Kč');setEl('tMaxEUR',tMx.priceEur.toFixed(2)+' EUR/MWh');setEl('tMaxTime','⏰ '+slotLabel(tMx.hour,tMx.minute));
    // Tomorrow strategy
    const tmrStrat = document.getElementById('tomorrowStrategy');
    if(tmrStrat) tmrStrat.style.display='block';
    const tmrTab2 = document.getElementById('strat-tab-tomorrow');
    if(tmrTab2) tmrTab2.style.opacity='1';
  } else {
    if(tmrChartSec) tmrChartSec.style.display='none';
    if(tmrEmptySec) tmrEmptySec.style.display='block';
    const tmrTab = document.getElementById('strat-tab-tomorrow');
    if(tmrTab) tmrTab.style.opacity='0.4';
  }

  // Synchronizuj aktivní tab s aktuálním módem
  document.querySelectorAll('.chart-tab').forEach(t => {
    const isToday = t.textContent.trim() === 'Dnes';
    t.classList.toggle('active', priceChartMode === 'today' ? isToday : !isToday);
  });
  renderPriceChart(priceChartMode);
  setTimeout(renderOverview, 50);
}

// ── PRICE CHART ───────────────────────────────────────────────


// ── HISTORY ───────────────────────────────────────────────────

// ── SPARKLINE ─────────────────────────────────────────────────
function renderSparkline(today, curIdx) {
  const canvas = document.getElementById('ov-sparkline');
  if (!canvas || !today.length) return;

  const prices = today.map(s => s.priceCZK);
  // Labely jen v 0, 6, 12, 18 hod.
  const labels = today.map(s => (s.minute === 0 && s.hour % 6 === 0) ? String(s.hour).padStart(2,'0') + ':00' : '');

  const priceColor = p => {
    if (p < 0)    return '#00F5FF'; // --price-negative
    if (p < 1000) return '#00E59B'; // --price-low
    if (p < 2500) return '#FFB700'; // --price-mid
    if (p < 4000) return '#FF8C42'; // --price-high
    return '#FF5E3A';               // --price-vhigh
  };

  const pointRadii = prices.map((_, i) => i === curIdx ? 4 : 0);
  const pointColors = prices.map(priceColor);

  // Gradient fill
  const canvas2 = document.getElementById('ov-sparkline');
  let gradFill = 'rgba(0,245,255,0.06)';
  if (canvas2) {
    const ctx2 = canvas2.getContext('2d');
    if (ctx2) {
      const grad = ctx2.createLinearGradient(0, 0, 0, canvas2.offsetHeight || 48);
      grad.addColorStop(0,   'rgba(255,140,66,0.28)');
      grad.addColorStop(0.5, 'rgba(255,183,0,0.12)');
      grad.addColorStop(1,   'rgba(0,229,155,0.02)');
      gradFill = grad;
    }
  }

  const data = {
    labels,
    datasets: [{
      data: prices,
      borderWidth: 2,
      fill: true,
      backgroundColor: gradFill,
      pointRadius: pointRadii,
      pointBackgroundColor: pointColors,
      pointBorderWidth: 0,
      pointHoverRadius: 0,
      tension: 0.4,
      segment: {
        borderColor: ctx => priceColor(prices[ctx.p1DataIndex] ?? prices[ctx.p0DataIndex]),
      },
    }],
  };

  const vtIndicesSpark = today.map((s, i) => VT_HOURS_SET.has(s.hour) ? i : -1).filter(i => i >= 0);
  const minP = Math.min(...prices) - 200;
  const maxP = Math.max(...prices) + 200;
  const priceBandsSpark = [
    {from:Math.min(minP,-1200), to:-1,                 color:'rgba(167,139,250,0.10)'},
    {from:-1,                   to:1000,               color:'rgba(0,229,155,0.08)'},
    {from:1000,                 to:2500,               color:'rgba(255,183,0,0.06)'},
    {from:2500,                 to:3500,               color:'rgba(255,140,66,0.09)'},
    {from:3500,                 to:Math.max(maxP,6000),color:'rgba(255,71,87,0.10)'},
  ];
  const options = {
    vtIndices: vtIndicesSpark,
    priceBands: priceBandsSpark,
    currentIndex: curIdx,
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: {
        display: true,
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: chartColors().tick,
          font: { family: 'JetBrains Mono', size: 8 },
          maxRotation: 0,
          padding: 2,
          autoSkip: false,
        }
      },
      y: { display: false },
    },
  };

  if (sparklineChart) {
    sparklineChart.data = data;
    sparklineChart.update('none');
  } else {
    sparklineChart = new Chart(canvas, { type: 'line', data, options });
  }
}

// ── OVERVIEW ─────────────────────────────────────────────────
function renderOverview() {
  if (!priceData) return;
  const today = priceData.hoursToday || [];
  if (!today.length) return;

  let idx = curSlotIdx(today); if(idx<0) idx=today.length-1;
  const cur = today[idx];
  const lc = levelClass(cur.level);

  renderSparkline(today, idx);

  // Hero price
  const el = id => document.getElementById(id);
  flashEl('ov-price', cur.priceCZK + ' Kč');
  el('ov-price').style.color = cur.priceCZK < 0   ? 'var(--price-negative)'
    : cur.priceCZK > 4000 ? 'var(--price-vhigh)'
    : cur.priceCZK > 2500 ? 'var(--price-high)'
    : cur.priceCZK < 1000 ? 'var(--price-low)'
    : 'var(--price-mid)';
  el('ov-price-sub').textContent = cur.priceEur.toFixed(2) + ' EUR/MWh · ' + slotLabel(cur.hour, cur.minute);
  // Hero stats — price (always available here)
  flashEl('ov-price-stat', cur.priceCZK + ' Kč');
  const lvlEl = el('ov-level');
  lvlEl.textContent = levelLabel(cur.level);
  lvlEl.className = 'badge badge-' + lc;

  // Decision — vždy z pravidel, ne ze sliderů Strategie stránky
  const _r = loadRules();
  const cfg = { buyBelow: _r.socBelow ?? parseFloat(el('cfg-buy')?.value??1000), sellAbove: _r.sellAbove ?? parseFloat(el('cfg-sell')?.value??3500), minSOC:0, batKwh:60 };
  const recs = fveData?.records || [];
  const soc = recs.find(r=>r.code==='bs')?.rawValue ?? recs.find(r=>r.code==='SOC')?.rawValue ?? 80;
  const solarW = recs.filter(r=>r.code==='PVP').reduce((s,r)=>s+(r.rawValue||0),0) || recs.find(r=>r.code==='Pdc')?.rawValue || 0;
  const dec = decideSlot(cur.priceCZK, soc, solarW, cfg);
  el('ov-decision').textContent = dec.icon + ' ' + dec.mode;
  el('ov-decision').style.color = dec.color;
  el('ov-decision').classList.toggle('mode-standby', dec.mode === 'STANDBY');
  el('ov-action').textContent = '';

  // FVE cards
  if (fveData) {
    flashEl('ov-solar', fmtW(solarW));
    // ov-solar-today se nastavuje v refreshAll z VRM dat — nepřepisovat
    const batPwr = recs.find(r=>r.code==='bp')?.rawValue ?? 0;
    flashEl('ov-soc', Math.round(soc) + '%');
    flashEl('ov-bat-pwr', fmtW(Math.abs(batPwr)) + (batPwr>50?' ↑ nabíjení':batPwr<-50?' ↓ vybíjení':''));
    const bar = el('ov-bat-bar');
    if(bar){ bar.style.width=soc+'%'; bar.style.background=soc>60?'var(--accent)':soc>30?'var(--yellow)':'var(--red)'; }
    const evW = recs.find(r=>r.code==='evp')?.rawValue ?? 0;
    const evState = recs.find(r=>r.code==='eve')?.formattedValue ?? '—';
    flashEl('ov-ev', fmtW(evW));
    el('ov-ev-status').textContent = evState;
    const g1=recs.find(r=>r.code==='g1')?.rawValue??0, g2=recs.find(r=>r.code==='g2')?.rawValue??0, g3=recs.find(r=>r.code==='g3')?.rawValue??0;
    const gridW = g1+g2+g3;
    flashEl('ov-grid', fmtW(Math.abs(gridW)));
    el('ov-grid').style.color = gridW<-50?'var(--green)':gridW>50?'var(--red)':'var(--green)';
    el('ov-grid-dir').textContent = gridW<-50?'→ Do sítě':gridW>50?'← Ze sítě':'Vyrovnáno';
    // Hero stats row
    flashEl('ov-soc-stat',  Math.round(soc) + '%');
    flashEl('ov-grid-stat', fmtW(Math.abs(gridW)));
  }

  // Sidebar mini status
  const sb = id => document.getElementById(id);
  flashEl('sb-solar', fmtW(solarW));
  flashEl('sb-soc',   Math.round(soc) + '%');
  flashEl('sb-price', cur.priceCZK + ' Kč');
  const sbBar = sb('sb-bat-bar');
  if(sbBar){ sbBar.style.width=soc+'%'; sbBar.style.background=soc>60?'var(--accent)':soc>30?'var(--yellow)':'var(--red)'; }

  // Arbitrage
  const allPrices = today.map(s=>s.priceCZK);
  const minP = Math.min(...allPrices), maxP = Math.max(...allPrices);
  const arb = Math.round((maxP-minP)/1000*60);
  setEl('ov-arb', arb > 0 ? arb.toLocaleString('cs-CZ') + ' Kč' : '—');
  setEl('ov-arb-detail', `${minP} → ${maxP} Kč/MWh`);
}

// Hook into refreshAll to also update overview and sidebar


