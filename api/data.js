import { czDate, fetchEurCzk, fetchOtePoints, parseOteSlots } from './_ote.js';
const EDGE_CONFIG_ID = process.env.EDGE_CONFIG_ID;
const VERCEL_TOKEN   = process.env.VERCEL_TOKEN;

const VT_HOURS = new Set([8, 12, 15, 19]);
const DIST_VT  = 754.77;
const DIST_NT  = 116.50;
const DG_BUY   = 350;
const DG_SELL  = 450;
const DAN      = 28.30;
const SYST     = 164.24;
const DPH      = 1.21;

export function realBuyPrice(spot, hour) {
  const dist = VT_HOURS.has(hour) ? DIST_VT : DIST_NT;
  return Math.round((spot + dist + DG_BUY + DAN + SYST) * DPH);
}

function getCzechTime() {
  const now    = new Date();
  const czDate = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Prague' }));
  return {
    hh:   czDate.getHours(),
    mm:   Math.floor(czDate.getMinutes() / 15) * 15,
    full: now
  };
}

async function loadRules() {
  try {
    const resp = await fetch(
      `https://api.vercel.com/v1/edge-config/${EDGE_CONFIG_ID}/item/rules`,
      {
        headers: { 'Authorization': `Bearer ${VERCEL_TOKEN}` },
        cache: 'no-store',
      }
    );
    if (!resp.ok) return null;
    const json = await resp.json();
    // Management API vrací { key, value, ... } — chceme value
    return json.value || null;
  } catch(e) {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  try {
    const q = req.query || {};

    // Načti uložená pravidla z Edge Config
    const saved = await loadRules();

    // Query parametry mají přednost pouze pokud jsou explicitně v URL
    // Pro /data.json (bez parametrů) se vždy použijí uložené hodnoty
    const feedAbove    = parseFloat(q.feed_above    !== undefined ? q.feed_above    : (saved?.feed_above    ?? 1500));
    const sellAbove    = parseFloat(q.sell_above    !== undefined ? q.sell_above    : (saved?.sell_above    ?? 3500));
    const sellSetpoint = parseInt  (q.sell_setpoint !== undefined ? q.sell_setpoint : (saved?.sell_setpoint ?? -7200));
    const socBelow     = parseFloat(q.soc_below     !== undefined ? q.soc_below     : (saved?.soc_below     ?? -1000));
    const socDefault   = parseInt  (q.soc_default   !== undefined ? q.soc_default   : (saved?.soc_default   ?? 10));
    const blockVT      = saved?.block_vt      !== undefined ? Boolean(saved.block_vt)      : true;
    const evcsEnabled  = saved?.evcs_enabled  !== undefined ? Boolean(saved.evcs_enabled)  : true;

    const { hh, mm, full } = getCzechTime();
    const pad = n => String(n).padStart(2, '0');

    // Načti spot cenu z OTE-CR
    let spot = null;
    let oteError = null;

    if (q.spot_czk !== undefined) {
      spot = parseFloat(q.spot_czk);
      if (!Number.isFinite(spot)) throw new Error(`Neplatná cena: ${spot}`);
    } else {
      try {
        const [eurCzk, points] = await Promise.all([fetchEurCzk(), fetchOtePoints(czDate(0))]);
        if (!points?.length) throw new Error('OTE-CR: prázdná data');
        const slots = parseOteSlots(points, eurCzk);
        let idx = slots.findIndex(s => s.hour === hh && s.minute === mm);
        if (idx < 0) idx = slots.length - 1;
        spot = slots[idx].priceCZK;
      } catch(e) {
        oteError = e.message;
      }
    }

    const isVT = VT_HOURS.has(hh);

    // Bez cen → standby: žádný prodej, žádný nákup, žádné přetoky
    if (oteError !== null) {
      return res.status(200).json({
        timestamp:       full.toISOString(),
        time_slot:       `${pad(hh)}:${pad(mm)}`,
        spot_czk:        null,
        sell_price_czk:  null,
        buy_price_czk:   null,
        grid_setpoint:   0,     // neutrální — nákup ani prodej
        block_export:    true,  // žádné přetoky do sítě
        setup_SOC:       10,    // nenabíjet z gridu
        evcs_start:      0,     // nezapínat nabíjení EV
        is_vt:           isVT,
        source:          'standby',
        ote_error:       oteError,
        rules: { feedAbove, sellAbove, sellSetpoint, socBelow, socDefault, blockVT, evcsEnabled, vtHours: [...VT_HOURS] }
      });
    }

    const buy_price_czk  = realBuyPrice(spot, hh);
    const sell_price_czk = Math.round(spot - DG_SELL);
    const block_export   = spot <= feedAbove;
    const grid_setpoint  = spot > sellAbove ? sellSetpoint : -50;
    const setup_SOC      = (isVT && blockVT) ? socDefault : (spot < socBelow ? 100 : socDefault);
    const evcs_start     = evcsEnabled ? 1 : 0;

    return res.status(200).json({
      timestamp:       full.toISOString(),
      time_slot:       `${pad(hh)}:${pad(mm)}`,
      spot_czk:        spot,
      sell_price_czk,
      buy_price_czk,
      grid_setpoint,
      block_export,
      setup_SOC,
      evcs_start,
      is_vt:           isVT,
      source:          q.spot_czk !== undefined ? 'manual' : 'auto',
      rules: { feedAbove, sellAbove, sellSetpoint, socBelow, socDefault, blockVT, evcsEnabled, vtHours: [...VT_HOURS] }
    });

  } catch(e) {
    return res.status(500).json({
      error:     e.message,
      timestamp: new Date().toISOString()
    });
  }
}
