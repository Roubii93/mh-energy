// Vrátí aktuální pravidla z Edge Config
// Volá se z appky při startu, aby všechna zařízení měla stejné hodnoty

const EDGE_CONFIG_ID = process.env.EDGE_CONFIG_ID;
const VERCEL_TOKEN   = process.env.VERCEL_TOKEN;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  if (!EDGE_CONFIG_ID || !VERCEL_TOKEN) {
    return res.status(500).json({ ok: false, rules: null, error: 'EDGE_CONFIG_ID or VERCEL_TOKEN env var not set' });
  }

  try {
    const resp = await fetch(
      `https://api.vercel.com/v1/edge-config/${EDGE_CONFIG_ID}/item/rules`,
      { headers: { 'Authorization': `Bearer ${VERCEL_TOKEN}` } }
    );
    if (!resp.ok) return res.status(200).json({ ok: false, rules: null });
    const json = await resp.json();
    return res.status(200).json({ ok: true, rules: json.value || null });
  } catch (e) {
    return res.status(200).json({ ok: false, rules: null, error: e.message });
  }
}
