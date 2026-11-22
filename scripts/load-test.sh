#!/usr/bin/env bash
# Runs the k6 load test (load-test/load.js) with the official k6 Docker image.
#
#   scripts/load-test.sh docker [smoke|load|stress]   # against the docker compose app
#   scripts/load-test.sh k8s    [smoke|load|stress]   # as a Job inside the k3s cluster,
#                                                     # while watching the autoscaler
set -euo pipefail
export MSYS_NO_PATHCONV=1

K6_IMAGE=grafana/k6:1.1.0
TARGET="${1:-docker}"
PROFILE="${2:-smoke}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
command -v cygpath >/dev/null && ROOT="$(cygpath -m "$ROOT")"

docker_test() {
  cd "$ROOT"
  local web
  web=$(docker compose --env-file .env.local ps -q web 2>/dev/null || true)
  if [ -z "$web" ]; then
    echo "==> Starting the app (docker compose)"
    docker compose --env-file .env.local up -d --build web
    web=$(docker compose --env-file .env.local ps -q web)
  fi
  mkdir -p load-test/results
  echo "==> k6 $PROFILE test"
  # Share the web container's network namespace, so the app is http://localhost.
  docker run --rm --network "container:$web" \
    -v "$ROOT/load-test:/work/load-test" -w /work \
    -e BASE_URL=http://localhost -e PROFILE="$PROFILE" \
    "$K6_IMAGE" run --quiet load-test/load.js
}

k8s_test() {
  cd "$ROOT"
  local workdir="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/sfs-k8s"
  command -v cygpath >/dev/null && workdir="$(cygpath -m "$workdir")"
  export KUBECONFIG="$workdir/kubeconfig"
  local ns=secure-file-share

  kubectl -n "$ns" delete job k6-load-test --ignore-not-found >/dev/null
  kubectl -n "$ns" create configmap k6-script --from-file=load.js=load-test/load.js \
    --dry-run=client -o yaml | kubectl apply -f - >/dev/null
  sed "s/value: stress/value: $PROFILE/" load-test/k6-job.yaml | kubectl apply -f - >/dev/null

  echo "==> k6 $PROFILE job started; autoscaler status every 15s:"
  until kubectl -n "$ns" get job k6-load-test -o jsonpath='{.status.conditions[*].type}' 2>/dev/null | grep -qE 'Complete|Failed'; do
    printf '%s  ' "$(date +%H:%M:%S)"
    kubectl -n "$ns" get hpa web --no-headers | awk '{print $3 " " $4 "  replicas " $(NF-1)}'
    sleep 15
  done
  kubectl -n "$ns" logs job/k6-load-test | tail -20
  echo "==> Final state"
  kubectl -n "$ns" get hpa web
  # Newer Kubernetes adds a SuccessCriteriaMet condition before Complete, so check all of them.
  kubectl -n "$ns" get job k6-load-test -o jsonpath='{.status.conditions[*].type}' | grep -qw Complete
}

case "$TARGET" in
  docker) docker_test ;;
  k8s) k8s_test ;;
  *) echo "usage: $0 docker|k8s [smoke|load|stress]"; exit 2 ;;
esac
