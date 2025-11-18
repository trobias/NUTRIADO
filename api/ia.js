// Fuerza runtime Node.js (evita límites más agresivos del Edge)
export const config = { runtime: 'nodejs' };

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

    // Garantiza pantry como array por comas (opcional pero útil)
    const pantry = Array.isArray(raw?.context?.pantry)
      ? raw.context.pantry
      : String(raw?.message || '')
          .split(',').map(s => s.trim()).filter(Boolean);

    const safe = {
      message: String(raw?.message ?? '').slice(0, 2000),
      context: { ...(raw?.context ?? {}), pantry },
      sessionId: String(raw?.sessionId ?? '').slice(0, 100),
    };

    // ⚠️ Quitar el AbortController (dejamos que Vercel maneje el timeout de la función)
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.N8N_SECRET) headers['X-API-KEY'] = process.env.N8N_SECRET;

    const r = await fetch(N8N_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(safe),
      // cache explícito para que no haya interferencias
      cache: 'no-store',
    });

    const ct = r.headers.get('content-type') || 'application/json';
    const text = await r.text();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(r.status).setHeader('Content-Type', ct).send(text);
  } catch (e) {
    return res.status(500).json({
      error: 'Proxy error',
      detail: String(e?.message || e),
    });
  }
}
