// ── VT BANDS PLUGIN ──────────────────────────────────────────
// Kreslí semi-průhledné pásy pro hodiny vysokého tarifu (VT)
Chart.register({
  id: 'vtBands',
  beforeDraw(chart) {
    const indices = chart.options.vtIndices;
    if (!indices || !indices.length) return;
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales.x) return;
    const n = chart.data.labels.length;
    if (!n) return;
    // Šířka jednoho datového bodu v pixelech
    const pxPerPt = (chartArea.right - chartArea.left) / n;
    // Seskup po sobě jdoucí indexy do pásů
    const bands = [];
    let s = null;
    indices.forEach((idx, i) => {
      if (s === null) s = idx;
      if (indices[i + 1] !== idx + 1) { bands.push([s, idx]); s = null; }
    });
    ctx.save();
    // Výplň pásu
    ctx.fillStyle = 'rgba(220,38,38,0.10)';
    bands.forEach(([a, b]) => {
      const x1 = Math.max(chartArea.left + a * pxPerPt, chartArea.left);
      const x2 = Math.min(chartArea.left + (b + 1) * pxPerPt, chartArea.right);
      ctx.fillRect(x1, chartArea.top, x2 - x1, chartArea.bottom - chartArea.top);
    });
    // Vrchní čára pásu
    ctx.fillStyle = 'rgba(220,38,38,0.45)';
    bands.forEach(([a, b]) => {
      const x1 = Math.max(chartArea.left + a * pxPerPt, chartArea.left);
      const x2 = Math.min(chartArea.left + (b + 1) * pxPerPt, chartArea.right);
      ctx.fillRect(x1, chartArea.top, x2 - x1, 2);
    });
    // Popis "VT"
    ctx.fillStyle = 'rgba(220,38,38,0.70)';
    ctx.font = '600 9px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    bands.forEach(([a, b]) => {
      const x1 = Math.max(chartArea.left + a * pxPerPt, chartArea.left);
      const x2 = Math.min(chartArea.left + (b + 1) * pxPerPt, chartArea.right);
      ctx.fillText('VT', (x1 + x2) / 2, chartArea.bottom - 6);
    });
    ctx.restore();
  }
});

// Plugin: barevné zónové pásy (horizontální) podle ceny
Chart.register({
  id: 'priceBands',
  beforeDraw(chart) {
    const zones = chart.options.priceBands;
    if (!zones || !zones.length) return;
    const { ctx, chartArea, scales: { y } } = chart;
    if (!chartArea || !y) return;
    ctx.save();
    zones.forEach(({ from, to, color }) => {
      const y1 = y.getPixelForValue(to);
      const y2 = y.getPixelForValue(from);
      ctx.fillStyle = color;
      ctx.fillRect(chartArea.left, Math.min(y1, chartArea.top), chartArea.right - chartArea.left, Math.max(y2, chartArea.bottom) - Math.min(y1, chartArea.top));
    });
    ctx.restore();
  }
});

// Plugin: svislá čára aktuálního slotu
Chart.register({
  id: 'currentSlotLine',
  afterDraw(chart) {
    const idx = chart.options.currentIndex;
    if (idx == null || idx < 0) return;
    const meta = chart.getDatasetMeta(0);
    const pt = meta?.data?.[idx];
    if (!pt) return;
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pt.x, chartArea.top);
    ctx.lineTo(pt.x, chartArea.bottom);
    ctx.stroke();
    // tečka
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
});
