#!/usr/bin/env bash
set -euo pipefail
[ -f .env ] && set -a && . ./.env && set +a

ORG="${1:-}"
[ -n "$ORG" ] || { echo "Usage: $0 <org>"; exit 1; }

for cmd in kubectl helm; do command -v "$cmd" >/dev/null 2>&1 || { echo "Missing $cmd"; exit 1; }; done

export KUBECONFIG="${HOME}/.kube/${ORG}.config"
kubectl cluster-info >/dev/null

kubectl create namespace tailscale-system --dry-run=client -o yaml | kubectl apply -f -
helm repo add tailscale https://pkgs.tailscale.com/helmcharts >/dev/null 2>&1 || true
helm repo update >/dev/null 2>&1 || true

if [ -n "${TS_OAUTH_CLIENT_ID:-}" ] && [ -n "${TS_OAUTH_CLIENT_SECRET:-}" ]; then
  kubectl -n tailscale-system create secret generic tailscale-oauth \
    --from-literal=client_id="${TS_OAUTH_CLIENT_ID}" \
    --from-literal=client_secret="${TS_OAUTH_CLIENT_SECRET}" \
    --dry-run=client -o yaml | kubectl apply -f -

  helm upgrade --install tailscale-operator tailscale/tailscale-operator \
    -n tailscale-system \
    --set oauth.clientId="${TS_OAUTH_CLIENT_ID}" \
    --set oauth.clientSecret="${TS_OAUTH_CLIENT_SECRET}" \
    --set proxyClass=default \
    --wait
elif [ -n "${TS_OPERATOR_AUTHKEY:-}" ]; then
  kubectl -n tailscale-system create secret generic ts-operator-auth \
    --from-literal=TS_AUTHKEY="${TS_OPERATOR_AUTHKEY}" \
    --dry-run=client -o yaml | kubectl apply -f -

  helm upgrade --install tailscale-operator tailscale/tailscale-operator \
    -n tailscale-system \
    --set authKeySecretName=ts-operator-auth \
    --set proxyClass=default \
    --wait
else
  echo "Set TS_OAUTH_CLIENT_ID/TS_OAUTH_CLIENT_SECRET or TS_OPERATOR_AUTHKEY in .env"; exit 1
fi

echo "Tailscale Operator installed in ${ORG}."
