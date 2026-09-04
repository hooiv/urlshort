import http from 'k6/http';
import { check, group, sleep } from 'k6';

// Soak: steady-state hot-path traffic for 2h at 20 VUs, held to the FULL
// production SLO (p95 redirect <= 500ms, error rate <= 0.1%). The sample is
// large enough that the tight error budget is meaningful — any sustained
// breach here is a leak, quota drift, or cache-poisoning regression.
export const options = {
  vus: 20,
  duration: '2h',
  thresholds: {
    'http_req_duration{route:redirect}': ['p(95)<500'],
    'http_req_failed{route:redirect}': ['rate<0.001'],
    http_req_failed: ['rate<0.001'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const HUMAN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

export function setup() {
  const res = http.post(
    `${BASE_URL}/api/shorten`,
    JSON.stringify({ url: `https://example.com/soak-${Date.now()}`, maxClicks: 1000000 }),
    { headers: { 'Content-Type': 'application/json' }, tags: { route: 'create' } },
  );
  let code = __ENV.SMOKE_CODE || '';
  try {
    const body = res.json();
    if (body && body.shortCode) code = String(body.shortCode);
  } catch {
    // Keep the env fallback.
  }
  return { code };
}

export default function loadTest(data) {
  const code = (data && data.code) || __ENV.SMOKE_CODE || '';
  if (!code) {
    http.get(`${BASE_URL}/api/status`, { tags: { route: 'status' } });
    sleep(1);
    return;
  }
  const isBot = Math.random() < 0.2;

  group('redirect hot path', () => {
    const res = http.get(`${BASE_URL}/${code}?utm_source=k6&utm_medium=soak`, {
      headers: { 'User-Agent': isBot ? BOT_UA : HUMAN_UA },
      redirects: 0,
      tags: { route: 'redirect', traffic: isBot ? 'bot' : 'human' },
    });
    check(res, {
      'redirect accepted': (r) => r.status === 307 || r.status === 200,
      'no server errors': (r) => r.status < 500,
    });
  });

  if (__ITER % 50 === 0) {
    group('analytics read', () => {
      const res = http.get(`${BASE_URL}/api/analytics/${code}?range=7d`, { tags: { route: 'analytics' } });
      check(res, { 'analytics served without 5xx': (r) => r.status < 500 });
    });
  }

  sleep(1);
}
