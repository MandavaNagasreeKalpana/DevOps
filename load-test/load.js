// k6 load test for the nginx-served app.
//
//   PROFILE=smoke  - 5 virtual users for 30s (used in CI)
//   PROFILE=load   - ramps to 50 users over ~2.5 minutes
//   PROFILE=stress - ramps to 200 users, used to trigger the Kubernetes autoscaler
//
// BASE_URL defaults to http://web (the Docker / Kubernetes service name).
import http from 'k6/http'
import { check, group, sleep } from 'k6'

const BASE_URL = __ENV.BASE_URL || 'http://web'
const PROFILE = __ENV.PROFILE || 'smoke'

const profiles = {
  smoke: { vus: 5, duration: '30s' },
  load: {
    stages: [
      { duration: '30s', target: 20 },
      { duration: '1m', target: 50 },
      { duration: '30s', target: 50 },
      { duration: '30s', target: 0 },
    ],
  },
  stress: {
    stages: [
      { duration: '30s', target: 50 },
      { duration: '2m', target: 200 },
      { duration: '1m', target: 200 },
      { duration: '30s', target: 0 },
    ],
  },
}

export const options = {
  ...profiles[PROFILE],
  thresholds: {
    // Fail the run if more than 1% of requests fail or p95 latency exceeds 500 ms.
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
    checks: ['rate>0.99'],
  },
}

export default function () {
  group('login page', () => {
    const res = http.get(`${BASE_URL}/login`, { tags: { page: 'login' } })
    check(res, {
      'status is 200': (r) => r.status === 200,
      'serves the app shell': (r) => r.body.includes('<div id="root">'),
      'has CSP header': (r) => (r.headers['Content-Security-Policy'] || '').includes("default-src 'self'"),
    })

    // Fetch the hashed JS bundle referenced by the page, as a browser would.
    const match = res.body.match(/\/assets\/[^"]+\.js/)
    if (match) {
      const asset = http.get(`${BASE_URL}${match[0]}`, { tags: { page: 'asset' } })
      check(asset, {
        'asset is 200': (r) => r.status === 200,
        'asset is cached for a year': (r) => (r.headers['Cache-Control'] || '').includes('max-age=31536000'),
      })
    }
  })

  sleep(1)
}

export function handleSummary(data) {
  const m = data.metrics
  const line = (name, v) => `${name.padEnd(28)}${v}\n`
  const text =
    `\nk6 ${PROFILE} test against ${BASE_URL}\n` +
    line('requests', m.http_reqs.values.count) +
    line('requests/s', m.http_reqs.values.rate.toFixed(1)) +
    line('failed requests', `${(m.http_req_failed.values.rate * 100).toFixed(2)}%`) +
    line('latency p95', `${m.http_req_duration.values['p(95)'].toFixed(1)} ms`) +
    line('latency max', `${m.http_req_duration.values.max.toFixed(1)} ms`) +
    line('checks passed', `${(m.checks.values.rate * 100).toFixed(2)}%`)
  return {
    stdout: text,
    [__ENV.SUMMARY_PATH || 'load-test/results/summary.json']: JSON.stringify(data, null, 2),
  }
}
