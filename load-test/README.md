# Load testing (k6)

`load.js` is a [k6](https://k6.io) script run from the official `grafana/k6` Docker image, so nothing needs to be installed. Each virtual user loads `/login`, checks the status, the app shell and the CSP header, then downloads the hashed JS bundle and checks that it is cached for a year.

The run **fails** if more than 1% of requests fail, if p95 latency goes above 500 ms, or if fewer than 99% of checks pass.

| Profile | Load | Used for |
| --- | --- | --- |
| `smoke` | 5 users for 30 s | CI (`load-test` job) |
| `load` | ramps to 50 users over 2.5 min | capacity check |
| `stress` | ramps to 200 users over 4 min | triggering the Kubernetes autoscaler |

```bash
bash scripts/load-test.sh docker smoke    # against the docker compose app
bash scripts/load-test.sh k8s stress      # Job inside the k3s cluster, prints HPA status every 15 s
```

A JSON summary is written to `load-test/results/summary.json` (ignored by Git; uploaded as an artifact in CI).

## Recorded results (local machine, Docker Desktop)

**Docker, smoke profile:** 300 requests, 9.9 req/s, 0.00% failed, p95 5.7 ms, all checks passed.

**Kubernetes (k3s), stress profile, autoscaler enabled:**

| Time into run | Pods (HPA) |
| --- | --- |
| 0:00 – 2:00 | 2 |
| 2:20 | 3 |
| 3:05 | 5 |
| 3:50 | 6 (maximum) |

59,584 requests at 247.6 req/s, **0.00% failed**, p95 latency 88.7 ms, max 1.1 s, 100% of checks passed. After the test the CPU target dropped back below 60%, and the HPA scales down after its 2-minute stabilisation window.
