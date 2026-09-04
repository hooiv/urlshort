export async function GET() {
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
  const script = `(() => {
  const ATTR = 'ql_attribution';
  const STORAGE = 'quicklink:attribution';
  const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  // Tokens are always v1.<base64url>.<base64url>; anything else in the fragment
  // is attacker-controlled junk and must never reach localStorage or /api/track.
  const TOKEN_PATTERN = /^v1\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$/;
  const MAX_TOKEN_LENGTH = 2048;
  const EVENT_PATTERN = /^[a-z0-9_]{1,64}$/;
  function isPlausibleToken(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_TOKEN_LENGTH && TOKEN_PATTERN.test(value);
  }
  // Read the live fragment on every call: the value captured at script load is
  // stale for hash-routed SPAs that change location.hash after this runs.
  function readFragmentToken() {
    try {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const param = params.get(ATTR);
      return isPlausibleToken(param) ? param : null;
    } catch { return null; }
  }
  function loadSaved() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE) || 'null');
      return saved && typeof saved === 'object' ? saved : null;
    } catch { return null; }
  }
  function persist(token) {
    try { localStorage.setItem(STORAGE, JSON.stringify({ token: token, savedAt: Date.now() })); } catch {}
  }
  const initial = readFragmentToken();
  if (initial) persist(initial);

  async function track(eventKey, options = {}) {
    const fresh = readFragmentToken();
    if (fresh) persist(fresh);
    const saved = loadSaved();
    if (!saved || !isPlausibleToken(saved.token)) return { accepted: false, reason: 'missing_attribution' };
    if (Date.now() - Number(saved.savedAt || 0) > TOKEN_TTL_MS) {
      try { localStorage.removeItem(STORAGE); } catch {}
      return { accepted: false, reason: 'expired_attribution' };
    }
    const key = String(eventKey || '').trim();
    if (!EVENT_PATTERN.test(key)) return { accepted: false, reason: 'invalid_event_key' };
    const payload = {
      attributionToken: saved.token,
      eventKey: key,
      valueCents: options.valueCents,
      currency: options.currency,
      metadata: options.metadata,
    };
    let response;
    try {
      response = await fetch('${baseUrl}/api/track', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    } catch { throw new Error('QuickLink conversion tracking failed'); }
    if (!response.ok) throw new Error('QuickLink conversion tracking failed');
    try { return await response.json(); } catch { return { accepted: response.ok }; }
  }

  window.QuickLink = Object.freeze({ track });
})();`;
  return new Response(script, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
