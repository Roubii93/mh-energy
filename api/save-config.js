// Endpoint volaný z appky při "Uložit pravidla"
// Zapíše prahy do Edge Config

const EDGE_CONFIG_ID = process.env.EDGE_CONFIG_ID;
const VERCEL_TOKEN   = process.env.VERCEL_TOKEN;
const NR_PASSWORD    = process.env.NR_PASSWORD;

export default async function handler(req, res) {
  // In dev (no NR_PASSWORD) allow all origins so localhost:3000 static server can POST here
  const isDevEnv = !NR_PASSWORD;
  res.setHeader('Access-Control-Allow-Origin', isDevEnv ? '*' : (process.env.ALLOWED_ORIGIN || 'https://mh-energy.vercel.app'));
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    const body = req.body || {};

    // Password verification — skipped in dev (no NR_PASSWORD set or __dev__ token)
    const isDev = !NR_PASSWORD || body.password === '__dev__';
    if (!isDev && body.password !== NR_PASSWORD) {
      return res.status(401).json({ error: 'Nesprávné heslo' });
    }
    // Validace rozsahů — ochrana před nesmyslnými hodnotami
    const body_fa  = parseFloat(body.feed_above    ?? 1500);
    const body_sa  = parseFloat(body.sell_above    ?? 3500);
    const body_ss  = parseInt(body.sell_setpoint   ?? -7200);
    const body_sb  = parseFloat(body.soc_below     ?? -1000);
    const body_sd  = parseInt(body.soc_default     ?? 10);

    if (body_ss < -7200 || body_ss > -50)       throw new Error('Neplatný setpoint: ' + body_ss);
    if (body_fa < -5000 || body_fa > 10000)      throw new Error('Neplatný feed_above: ' + body_fa);
    if (body_sa < -5000 || body_sa > 10000)      throw new Error('Neplatný sell_above: ' + body_sa);
    if (body_sb < -10000 || body_sb > 0)         throw new Error('Neplatný soc_below: ' + body_sb);
    if (body_sd < 0     || body_sd > 90)         throw new Error('Neplatný soc_default: ' + body_sd);

    const config = {
      feed_above:    body_fa,
      sell_above:    body_sa,
      sell_setpoint: body_ss,
      soc_below:     body_sb,
      soc_default:   body_sd,
      block_vt:      body.block_vt     !== undefined ? Boolean(body.block_vt)     : true,
      evcs_enabled:  body.evcs_enabled !== undefined ? Boolean(body.evcs_enabled) : true,
      updated_at:    new Date().toISOString(),
    };

    // Zapiš do Edge Config přes Vercel API
    const response = await fetch(
      `https://api.vercel.com/v1/edge-config/${EDGE_CONFIG_ID}/items`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${VERCEL_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [
            { operation: 'upsert', key: 'rules', value: config }
          ]
        })
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Edge Config error: ${err}`);
    }

    res.status(200).json({ ok: true, config });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
