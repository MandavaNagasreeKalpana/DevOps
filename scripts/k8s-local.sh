#!/usr/bin/env bash
# Runs the app on a throwaway single-node Kubernetes cluster (k3s inside Docker).
# Only Docker and kubectl are needed - no kind, minikube or cloud account.
#
#   scripts/k8s-local.sh up      # start cluster, load image, deploy, smoke test
#   scripts/k8s-local.sh down    # delete the cluster
#
# The app image must already exist as secure-file-share:local
# (npm run docker:up, or docker compose --env-file .env.local build).
set -euo pipefail
export MSYS_NO_PATHCONV=1   # keep Git Bash on Windows from rewriting container paths

CLUSTER=sfs-k3s
K3S_IMAGE=rancher/k3s:v1.33.1-k3s1
APP_IMAGE=secure-file-share:local
NAMESPACE=secure-file-share
WORKDIR="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/sfs-k8s"
# On Windows (Git Bash), kubectl.exe needs a Windows-style path.
command -v cygpath >/dev/null && WORKDIR="$(cygpath -m "$WORKDIR")"
export KUBECONFIG="$WORKDIR/kubeconfig"

up() {
  mkdir -p "$WORKDIR"
  docker image inspect "$APP_IMAGE" >/dev/null || { echo "Build $APP_IMAGE first"; exit 1; }

  if ! docker ps --format '{{.Names}}' | grep -qx "$CLUSTER"; then
    echo "==> Starting k3s"
    docker run -d --name "$CLUSTER" --privileged -p 127.0.0.1:6443:6443 \
      "$K3S_IMAGE" server --disable=traefik --tls-san 127.0.0.1 >/dev/null
  fi

  echo "==> Waiting for the API server"
  for _ in $(seq 1 60); do
    docker exec "$CLUSTER" test -f /etc/rancher/k3s/k3s.yaml 2>/dev/null && break
    sleep 2
  done
  docker exec "$CLUSTER" cat /etc/rancher/k3s/k3s.yaml > "$KUBECONFIG"
  # A fresh k3s can take a few minutes to start on Docker Desktop.
  for _ in $(seq 1 150); do
    kubectl get nodes 2>/dev/null | grep -q ' Ready' && break
    sleep 2
  done
  kubectl get nodes

  echo "==> Loading $APP_IMAGE into the cluster"
  docker save "$APP_IMAGE" -o "$WORKDIR/app.tar"
  docker cp "$WORKDIR/app.tar" "$CLUSTER:/tmp/app.tar"
  docker exec "$CLUSTER" ctr images import /tmp/app.tar >/dev/null

  echo "==> Deploying"
  kubectl apply -k k8s
  # Restart so a rebuilt image with the same tag is picked up.
  kubectl -n "$NAMESPACE" rollout restart deploy/web >/dev/null
  kubectl -n "$NAMESPACE" rollout status deploy/web --timeout=180s
  kubectl -n "$NAMESPACE" get pods,svc,hpa,pdb

  echo "==> Smoke test through the Service"
  kubectl -n "$NAMESPACE" port-forward svc/web 18080:80 >"$WORKDIR/port-forward.log" 2>&1 &
  PF=$!
  trap 'kill $PF 2>/dev/null || true' EXIT
  for _ in $(seq 1 30); do
    curl -s -o /dev/null http://127.0.0.1:18080/ && break
    sleep 1
  done
  for path in / /login; do
    code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:18080$path" || true)
    echo "GET $path -> $code"
    [ "$code" = 200 ]
  done
  headers=$(curl -sI http://127.0.0.1:18080/ || true)
  echo "$headers" | grep -qi '^x-frame-options: DENY' && echo "security headers present"
  echo "==> OK. Run: export KUBECONFIG=$KUBECONFIG"
}

down() {
  docker rm -f "$CLUSTER" >/dev/null 2>&1 && echo "Deleted $CLUSTER" || echo "No cluster running"
}

case "${1:-}" in
  up) up ;;
  down) down ;;
  *) echo "usage: $0 up|down"; exit 2 ;;
esac
