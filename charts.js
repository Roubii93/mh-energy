// ── PRICE CHART ───────────────────────────────────────────────
function priceBarColor(p) {
  if(p<-1000) return 'rgba(167,139,250,0.85)';
  if(p<1000)  return 'rgba(0,229,155,0.80)';
  if(p<2500)  return 'rgba(255,183,0,0.82)';
  if(p<3500)  return 'rgba(255,140,66,0.82)';
  if(p<5000)  return 'rgba(255,94,58,0.85)';
  return 'rgba(185,28,28,0.90)';
}

function buildPriceChart(ctx, slots, curIdx, chartRef) {
  if(chartRef) chartRef.destroy();
  const labels    = slots.map(s => s.minute===0 && s.hour%4===0 ? slotLabel(s.hour,0) : '');
  const prices    = slots.map(s => s.priceCZK);
  const bgColors  = slots.map((s,i) => i===curIdx ? 'rgba(255,255,255,0.92)' : priceBarColor(s.priceCZK));
  const vtIndices = slots.map((s,i) => VT_HOURS_SET.has(s.hour) ? i : -1).filter(i=>i>=0);

  return new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data:prices, backgroundColor:bgColors, borderRadius:3, borderSkipped:false, barPercentage:0.85, categoryPercentage:1 }] },
    options: {
      vtIndices,
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          position:'nearest', yAlign:'bottom', caretSize:4, cornerRadius:10, padding:10,
          backgroundColor:chartColors().tooltip, titleColor:chartColors().ttTitle, bodyColor:chartColors().ttBody,
          borderColor:chartColors().ttBorder, borderWidth:1,
          callbacks: {
            title: items => slotLabel(slots[items[0].dataIndex].hour, slots[items[0].dataIndex].minute),
            label: item => { const s=slots[item.dataIndex]; return [` Spot: ${s.priceCZK.toLocaleString('cs-CZ')} Kč/MWh`,` EUR: ${s.priceEur.toFixed(2)} €`,` ${levelLabel(s.level)}`]; }
          }
        }
      },
      scales: {
        x: { grid:{display:false}, border:{display:false}, ticks:{color:chartColors().tick,font:{family:'JetBrains Mono',size:9},maxRotation:0,padding:4,autoSkip:false} },
        y: { grid:{color:chartColors().grid,drawTicks:false}, border:{display:false},
             ticks:{color:chartColors().tick,font:{family:'JetBrains Mono',size:9},padding:8,maxTicksLimit:6,
               callback:v=>v>=1000?(v/1000).toFixed(1)+'k':v<=-1000?(v/1000).toFixed(1)+'k':v} }
      }
    }
  });
}

function renderTomorrowChart(slots) {
  const wrap  = document.getElementById('priceChartTmrWrap');
  const empty = document.getElementById('priceChartTmrEmpty');
  if(!slots || !slots.length) {
    if(wrap) wrap.style.display='none';
    if(empty) empty.style.display='block';
    return;
  }
  if(wrap) wrap.style.display='block';
  if(empty) empty.style.display='none';
  const ctx = document.getElementById('priceChartTmr')?.getContext('2d');
  if(!ctx) return;
  priceChartTmr = buildPriceChart(ctx, slots, -1, priceChartTmr);
}

function switchPriceChart(mode, btn) {
  priceChartMode=mode;
  document.querySelectorAll('.chart-tab').forEach(t=>t.classList.remove('active'));
  if(btn) btn.classList.add('active');
  renderPriceChart(mode);
}

function renderPriceChart(mode) {
  if(!priceData) return;
  const slots  = mode==='tomorrow' ? (priceData.hoursTomorrow||[]) : (priceData.hoursToday||[]);
  if(!slots.length) return;
  const curIdx = mode==='today' ? curSlotIdx(slots) : -1;
  const ctx    = document.getElementById('priceChart')?.getContext('2d');
  if(!ctx) return;
  priceChart = buildPriceChart(ctx, slots, curIdx, priceChart);
}


// ── PRICE CHART ───────────────────────────────────────────────


// ── HISTORY ───────────────────────────────────────────────────

