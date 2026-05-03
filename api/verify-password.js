// Verifies NR_PASSWORD from env var — never exposes the password to the client
// Rate limiting: max 5 failed attempts per IP per 15 minutes (in-memory, resets on cold start)

const failedAttempts = new Map(); // ip → { count, firstAt }
const RATE_LIMIT     = 5;         // max failed attempts
const WINDOW_MS      = 15 * 60 * 1000; // 15 minutes

function isRateLimited(ip) {
  const now    = Date.now();
  const record = failedAttempts.get(ip);
  if (!record) return false;
  if (now - record.firstAt > WINDOW_MS) { failedAttempts.delete(ip); return false; }
  return record.count >= RATE_LIMIT;
}

function recordFailure(ip) {
  const now    = Date.now();
  const record = failedAttempts.get(ip);
  if (!record || Date.now() - record.firstAt > WINDOW_MS) {
    failedAttempts.set(ip, { count: 1, firstAt: now });
  } else {
    record.count++;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';

  if (isRateLimited(ip)) {
    return res.status(429).json({ ok: false, error: 'Příliš mnoho pokusů. Zkus to za 15 minut.' });
  }

  const NR_PASSWORD = process.env.NR_PASSWORD;
  if (!NR_PASSWORD) {
    return res.status(500).json({ ok: false, error: 'NR_PASSWORD env var not set' });
  }

  const { password } = req.body ?? {};
  if (!password) {
    return res.status(400).json({ ok: false, error: 'Missing password' });
  }

  const ok = password === NR_PASSWORD;
  if (!ok) recordFailure(ip);

  return res.status(ok ? 200 : 401).json({ ok });
}
