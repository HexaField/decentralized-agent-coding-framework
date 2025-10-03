#!/usr/bin/env bash
set -euo pipefail
[ -f .env ] && set -a && . ./.env && set +a
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "${SCRIPT_DIR}/org_helpers.sh"

ORG="${1:-}"
[ -n "$ORG" ] || { echo "Usage: $0 <org>"; exit 1; }

export KUBECONFIG="${HOME}/.kube/${ORG}.config"
NS_PREFIX="$(ns_prefix "$ORG")"
NS="${NS_PREFIX}-${ORG}"

kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -
kubectl -n "$NS" create deployment demo --image=nginx:1.25 --replicas=2 \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n "$NS" set resources deploy/demo --limits=cpu=200m,memory=256Mi --requests=cpu=50m,memory=64Mi || true

kubectl -n "$NS" expose deploy demo --port=80 --target-port=80 --type=LoadBalancer --name=demo \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n "$NS" annotate svc demo tailscale.com/expose="true" --overwrite

echo "Waiting for tailnet endpoint..."
for i in {1..60}; do
  HN=$(kubectl -n "$NS" get svc demo -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
  IP=$(kubectl -n "$NS" get svc demo -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
  if [ -n "${HN}" ] || [ -n "${IP}" ]; then
    echo "Tailnet endpoint: ${HN:-$IP}"
    exit 0
  fi
  sleep 2
done
echo "Timed out waiting for tailnet endpoint"; exit 1
