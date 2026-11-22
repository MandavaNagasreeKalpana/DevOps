#!/usr/bin/env bash
# Runs Terraform from the official Docker image, so Terraform itself doesn't need to be installed.
# The Docker socket is mounted so the Docker provider can manage containers on this machine.
#
#   scripts/terraform.sh init
#   scripts/terraform.sh plan
#   scripts/terraform.sh apply -auto-approve
#   scripts/terraform.sh destroy -auto-approve
set -euo pipefail
export MSYS_NO_PATHCONV=1

TF_IMAGE=hashicorp/terraform:1.12.2
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
command -v cygpath >/dev/null && ROOT="$(cygpath -m "$ROOT")"

docker run --rm -i \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$ROOT:/repo" \
  -w /repo/infra/terraform \
  -e TF_IN_AUTOMATION=1 \
  "$TF_IMAGE" "$@"
