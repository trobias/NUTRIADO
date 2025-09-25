// api/ia.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const N8N_URL = process.env.N8N_WEBHOOK_URL;
  if (!N8N_URL) {
    return res.status(500).json({ error: 'Missing N8N_WEBHOOK_URL' });
  }

  try {
    const raw = (req.body && typeof req.body === 'object') ? req.body : JSON.parse(req.body || '{}');
    const safe = {
      message: String(raw?.message ?? '').slice(0, 2000),
      context: raw?.context ?? {},
      sessionId: String(raw?.sessionId ?? '').slice(0, 100),
    };

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 25000);

    const headers = { 'Content-Type': 'application/json' };
    if (process.env.N8N_SECRET) headers['X-API-KEY'] = process.env.N8N_SECRET;

    const r = await fetch(N8N_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(safe),
      signal: controller.signal,
    });

    clearTimeout(t);

    const ct = r.headers.get('content-type') || 'application/json';
    const text = await r.text();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(r.status).setHeader('Content-Type', ct).send(text);
  } catch (e) {
    const msg = e?.name === 'AbortError'
      ? 'Upstream timeout (n8n tardó demasiado en responder)'
      : String(e?.message || e);
    return res.status(500).json({ error: 'Proxy error', detail: msg });
  }
}
