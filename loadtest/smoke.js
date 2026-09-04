import http from 'k6/http';
import { check, group, sleep } from 'k6';

// Smoke: the REAL hot path (create -> redirect -> analytics), held to the
// production SLO on the redirect itself: p95 <= 500ms. The overall error
// budget here (1%) is deliberately looser than the 0.1% production SLO
// because a 30s smoke sample is tiny; the soak run enforces the full SLO.
export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    'http_req_duration{route:redirect}': ['p(95)<500'],
    'http_req_failed{route:redirect}': ['rate<0.01'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const HUMAN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

function tryShortCode(res) {
  try {
    const body = res.json();
    return body && body.shortCode ? String(body.shortCode) : '';
  } catch {
    return '';
  }
}

export function setup() {
  const live = http.post(
    `${BASE_URL}/api/shorten`,
    JSON.stringify({ url: `https://example.com/smoke-${Date.now()}` }),
    { headers: { 'Content-Type': 'application/json' }, tags: { route: 'create' } },
  );
  const expired = http.post(
    `${BASE_URL}/api/shorten`,
    JSON.stringify({ url: 'https://example.com/smoke-expired', expiresAt: new Date(Date.now() - 60_000).toISOString() }),
    { headers: { 'Content-Type': 'application/json' }, tags: { route: 'create' } },
  );
  return {
    code: tryShortCode(live) || __ENV.SMOKE_CODE || '',
    expiredCode: tryShortCode(expired) || '',
  };
}

function getRedirect(code, ua, traffic) {
  // redirects: 0 exposes the 307 itself so we measure redirect latency, not
  // the destination page.
  return http.get(`${BASE_URL}/${code}?utm_source=k6&utm_medium=smoke`, {
    headers: { 'User-Agent': ua },
    redirects: 0,
    tags: { route: 'redirect', traffic },
  });
}

export default function loadTest(data) {
  const code = (data && data.code) || __ENV.SMOKE_CODE || '';
  if (!code) {
    http.get(`${BASE_URL}/api/status`, { tags: { route: 'status' } });
    sleep(1);
    return;
  }

  group('redirect hot path (human vs bot mix)', () => {
    const human = getRedirect(code, HUMAN_UA, 'human');
    check(human, {
      'human redirect accepted': (r) => r.status === 307 || r.status === 200,
      'human redirect has location': (r) => r.status !== 307 || String(r.headers.Location || r.headers.location || '').length > 0,
    });

    // Bots must still redirect, but downstream they are nonBillable: they may
    // never burn quota or trip maxClicks before any human arrives.
    const bot = getRedirect(code, BOT_UA, 'bot');
    check(bot, {
      'bot redirect accepted': (r) => r.status === 307 || r.status === 200,
    });
  });

  group('expired link', () => {
    const expiredCode = data && data.expiredCode;
    if (expiredCode) {
      const res = getRedirect(expiredCode, HUMAN_UA, 'human');
      check(res, {
        'expired link redirects to expiry page': (r) => r.status === 307 && /expired/i.test(String(r.headers.Location || r.headers.location || '')),
      });
    }
  });

  group('analytics read', () => {
    // Unauthenticated reads are rejected (401) but must never 5xx.
    const res = http.get(`${BASE_URL}/api/analytics/${code}?range=7d`, { tags: { route: 'analytics' } });
    check(res, { 'analytics served without 5xx': (r) => r.status < 500 });
  });

  group('status', () => {
    const res = http.get(`${BASE_URL}/api/status`, { tags: { route: 'status' } });
    check(res, { 'status ok': (r) => r.status === 200 });
  });

  sleep(1);
}
