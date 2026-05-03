export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');

  const lat = process.env.SITE_LAT;
  const lon = process.env.SITE_LON;
  const kwp = parseFloat(process.env.FVE_KWP || '15');
  const PR  = 0.82; // Performance Ratio

  if (!lat || !lon) {
    return res.status(500).json({ error: 'SITE_LAT / SITE_LON env vars not set' });
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=shortwave_radiation&forecast_days=2&timezone=Europe%2FPrague`;
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!r.ok) throw new Error('Open-Meteo HTTP ' + r.status);
    const data = await r.json();

    const times = data.hourly.time;
    const rad   = data.hourly.shortwave_radiation;

    const forecast = times.map((t, i) => ({
      time:          t,
      hour:          parseInt(t.slice(11, 13)),
      date:          t.slice(0, 10),
      radiation_wm2: rad[i] ?? 0,
      expected_w:    Math.round((rad[i] ?? 0) * kwp * PR),
    }));

    return res.status(200).json({ success: true, kwp, pr: PR, forecast });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
