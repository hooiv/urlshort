export async function GET() {
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
  const script = `(() => {
  const ATTR = 'ql_attribution';
  const STORAGE = 'quicklink:attribution';
  const params = new URLSearchParams(window.location.hash.replace(/^#/, '')); const param = params.get(ATTR);
  if (param) {
    try { localStorage.setItem(STORAGE, JSON.stringify({ token: param, savedAt: Date.now() })); } catch {}
  }

  async function track(eventKey, options = {}) {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE) || 'null'); } catch {}
    if (!saved?.token) return { accepted: false, reason: 'missing_attribution' };
    if (Date.now() - Number(saved.savedAt || 0) > 30 * 24 * 60 * 60 * 1000) {
      try { localStorage.removeItem(STORAGE); } catch {}
      return { accepted: false, reason: 'expired_attribution' };
    }
    const payload = {
      attributionToken: saved.token,
      eventKey: String(eventKey || '').trim(),
      valueCents: options.valueCents,
      currency: options.currency,
      metadata: options.metadata,
    };
    const response = await fetch('${baseUrl}/api/track', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
    if (!response.ok) throw new Error('QuickLink conversion tracking failed');
    return response.json();
  }

  window.QuickLink = Object.freeze({ track });
})();`;
  return new Response(script, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
