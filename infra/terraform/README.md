# Terraform: local staging environment

Infrastructure as Code for a load-balanced **staging** environment on Docker, using the free [kreuzwerker/docker](https://registry.terraform.io/providers/kreuzwerker/docker/latest) provider. No cloud account or paid service is needed, and Terraform runs from its official Docker image via `scripts/terraform.sh`.

## What it creates

| Resource | Details |
| --- | --- |
| `docker_network.this` | Private network `staging-net` |
| `docker_container.web[*]` | `app_replicas` app containers (default 2) with health checks |
| `docker_container.lb` | nginx load balancer on `127.0.0.1:8088`; its upstream list is generated from the app containers with `templatefile()`, and every response carries an `X-Upstream` header |
| Monitoring (optional) | Prometheus (`:9091`), Grafana (`:3001`), blackbox and nginx exporters, reusing the configs in `monitoring/` — files are uploaded into containers, so no host bind mounts |

Every resource gets `app.managed-by=terraform` and `app.environment` labels.

## Usage

```bash
docker compose --env-file .env.local build          # builds secure-file-share:local
bash scripts/terraform.sh init
bash scripts/terraform.sh plan
bash scripts/terraform.sh apply -auto-approve
curl -I http://127.0.0.1:8088/                     # see X-Upstream change between containers

# scale out: Terraform adds a container and regenerates the load balancer config
bash scripts/terraform.sh apply -auto-approve -var app_replicas=3

bash scripts/terraform.sh destroy -auto-approve
```

Copy `terraform.tfvars.example` to `terraform.tfvars` to change defaults. State is kept locally in `terraform.tfstate` (ignored by Git).

## In CI

The `terraform` job runs `terraform fmt -check`, `init -backend=false` and `validate`.
