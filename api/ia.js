export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');

    const safe = {
      message: String(body?.message ?? '').slice(0, 2000),
      context: body?.context ?? {},
      sessionId: String(body?.sessionId ?? '').slice(0, 100),
    };

    const r = await fetch(process.env.N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': process.env.N8N_SECRET || '',
      },
      body: JSON.stringify(safe),
    });

    const contentType = r.headers.get('content-type') || '';
    const text = await r.text();
    res.status(r.status).setHeader('Content-Type', contentType || 'application/json').send(text);
  } catch (e) {
    res.status(500).json({ error: 'Proxy error', detail: String(e) });
  }
}
