// /api/ia.js
export default async function handler(req, res) {
  // Solo permitimos POST (GET/HEAD para debug friendly)
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed', allow: 'POST' });
  }

  // Necesitamos la URL del webhook de n8n
  const N8N_URL = process.env.N8N_WEBHOOK_URL;
  if (!N8N_URL) {
    return res.status(500).json({
      error: 'Missing N8N_WEBHOOK_URL',
      hint: 'Definí la variable de entorno en Vercel → Project → Settings → Environment Variables'
    });
  }

  try {
    // Acepta req.body como objeto (Vercel ya parsea JSON) o string y lo parsea
    const raw = (req.body && typeof req.body === 'object') ? req.body : JSON.parse(req.body || '{}');

    // Sanitizado básico
    const safe = {
      message: String(raw?.message ?? '').slice(0, 2000),
      context: raw?.context ?? {},
      sessionId: String(raw?.sessionId ?? '').slice(0, 100),
    };

    // Timeout para evitar requests colgados
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000); // 25s

    const r = await fetch(N8N_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }, // SIN X-API-KEY
      body: JSON.stringify(safe),
      signal: controller.signal,
    }).catch((err) => {
      // fetch solo tira error en abort/red
      throw new Error(`Fetch to n8n failed: ${err.message}`);
    });
    clearTimeout(timeout);

    // Pasamos el content-type que venga de n8n (o default JSON)
    const ct = r.headers.get('content-type') || 'application/json';
    const text = await r.text();

    // Opcional: evitar cacheos intermedios
    res.setHeader('Cache-Control', 'no-store');

    return res.status(r.status).setHeader('Content-Type', ct).send(text);
  } catch (e) {
    const msg = (e && e.name === 'AbortError')
      ? 'Upstream timeout (n8n tardó demasiado en responder)'
      : String(e?.message || e);

    return res.status(500).json({
      error: 'Proxy error',
      detail: msg
    });
  }
}
