# Kubernetes deployment

Plain manifests, combined with Kustomize (built into `kubectl`).

| File | What it does |
| --- | --- |
| `namespace.yaml` | `secure-file-share` namespace with the *baseline* Pod Security Standard enforced |
| `deployment.yaml` | 2 replicas of the nginx image, rolling updates with zero unavailable pods, readiness and liveness probes, CPU/memory requests and limits, dropped Linux capabilities, no service-account token |
| `service.yaml` | ClusterIP Service on port 80 |
| `hpa.yaml` | HorizontalPodAutoscaler: 2–6 pods, target 60% CPU |
| `pdb.yaml` | PodDisruptionBudget: at least 1 pod stays up during node drains |
| `networkpolicy.yaml` | Only port 80 is open to other pods; the metrics port 8081 only to the nginx exporter |
| `kustomization.yaml` | Puts everything in the namespace and adds common labels |

## Run it locally (Docker only)

`scripts/k8s-local.sh` starts a single-node [k3s](https://k3s.io) cluster inside a Docker container, so no kind, minikube or cloud account is needed. k3s includes metrics-server, so the autoscaler works.

```bash
docker compose --env-file .env.local build      # builds secure-file-share:local
bash scripts/k8s-local.sh up                    # cluster + deploy + smoke test
export KUBECONFIG=/tmp/sfs-k8s/kubeconfig       # path printed by the script
kubectl -n secure-file-share get pods,hpa
kubectl -n secure-file-share port-forward svc/web 18080:80   # open http://127.0.0.1:18080
bash scripts/k8s-local.sh down
```

## In CI

The `kubernetes` job builds the image, validates the rendered manifests with kubeconform, then runs the same script to deploy to k3s and smoke-test `/` and `/login` through the Service.
