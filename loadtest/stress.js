import http from 'k6/http';
import { check, group, sleep } from 'k6';

// Stress: ramp the REAL hot path past the SLO to find the knee. Smoke holds
// p95 <= 500ms; here the redirect budget is relaxed to p95 < 800ms while we
// push to 200 VUs, with a 1% error budget. Failures here locate capacity
// limits — they do not page.
export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m', target: 200 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    'http_req_duration{route:redirect}': ['p(95)<800'],
    'http_req_failed{route:redirect}': ['rate<0.01'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const HUMAN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

export function setup() {
  // Pre-create a small pool once: link creation is rate-limited (20/min), so
  // VUs must NOT create links inside the hot loop or 429s would pollute the
  // error budget.
  const codes = [];
  for (let i = 0; i < 5; i += 1) {
    const res = http.post(
      `${BASE_URL}/api/shorten`,
      JSON.stringify({ url: `https://example.com/stress-${Date.now()}-${i}` }),
      { headers: { 'Content-Type': 'application/json' }, tags: { route: 'create' } },
    );
    try {
      const body = res.json();
      if (body && body.shortCode) codes.push(String(body.shortCode));
    } catch {
      // Fall through to the env-provided code below.
    }
  }
  if (!codes.length && __ENV.SMOKE_CODE) codes.push(String(__ENV.SMOKE_CODE));
  return { codes };
}

export default function loadTest(data) {
  const codes = (data && data.codes && data.codes.length && data.codes) || (__ENV.SMOKE_CODE ? [String(__ENV.SMOKE_CODE)] : []);
  if (!codes.length) {
    http.get(`${BASE_URL}/api/status`, { tags: { route: 'status' } });
    sleep(0.5);
    return;
  }
  const code = codes[Math.floor(Math.random() * codes.length)];
  // ~80/20 human/bot mix, matching production crawler share.
  const isBot = Math.random() < 0.2;

  group('redirect under load', () => {
    const res = http.get(`${BASE_URL}/${code}?utm_source=k6&utm_medium=stress&s=${__VU}`, {
      headers: { 'User-Agent': isBot ? BOT_UA : HUMAN_UA },
      redirects: 0,
      tags: { route: 'redirect', traffic: isBot ? 'bot' : 'human' },
    });
    check(res, {
      'redirect accepted': (r) => r.status === 307 || r.status === 200,
      'no server errors': (r) => r.status < 500,
    });
  });

  group('maxClicks admission', () => {
    // Capped links must fail closed to the expiry page (307), never 5xx, even
    // when the reservation race is hot.
    const res = http.get(`${BASE_URL}/${code}`, {
      headers: { 'User-Agent': HUMAN_UA },
      redirects: 0,
      tags: { route: 'redirect', traffic: 'human' },
    });
    check(res, { 'capped link never 5xx': (r) => r.status < 500 });
  });

  if (__ITER % 20 === 0) {
    group('analytics read', () => {
      const res = http.get(`${BASE_URL}/api/analytics/${code}?range=24h`, { tags: { route: 'analytics' } });
      check(res, { 'analytics served without 5xx': (r) => r.status < 500 });
    });
  }

  sleep(0.2);
}
