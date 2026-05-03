// Whitelist of allowed VRM API path patterns — prevents open proxy abuse
const ALLOWED_PATHS = [
  /^\/installations\/\d+\/diagnostics(\?.*)?$/,
  /^\/installations\/\d+\/summary(\?.*)?$/,
  /^\/installations\/\d+\/stats(\?.*)?$/,
  /^\/installations\/\d+\/overallstats(\?.*)?$/,
  /^\/installations\/\d+\/widgets(\?.*)?$/,
  /^\/installations\/\d+\/gps-download(\?.*)?$/,
  /^\/users\/me\/installations(\?.*)?$/,
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  const VRM_TOKEN = process.env.VRM_TOKEN;
  if (!VRM_TOKEN) {
    return res.status(500).json({ error: 'VRM_TOKEN env var not set', records: [] });
  }

  const path = req.query.path || '';
  if (!path) {
    return res.status(400).json({ error: 'Missing path query parameter', records: [] });
  }

  // Reject any path not on the whitelist
  const allowed = ALLOWED_PATHS.some(pattern => pattern.test(path));
  if (!allowed) {
    return res.status(403).json({ error: 'VRM path not allowed', records: [] });
  }

  const url  = `https://vrmapi.victronenergy.com/v2${path}`;

  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, {
      method: req.method || 'GET',
      signal: controller.signal,
      headers: {
        'X-Authorization': `Token ${VRM_TOKEN}`,
        'Content-Type': 'application/json'
      },
      ...(req.method === 'POST' && req.body ? { body: JSON.stringify(req.body) } : {})
    });
    const data = await response.json();
    res.status(200).json(data);
  } catch (e) {
    const isTimeout = e.name === 'AbortError';
    res.status(isTimeout ? 504 : 500).json({
      error: isTimeout ? 'VRM API timeout' : e.message,
      records: []
    });
  }
}
