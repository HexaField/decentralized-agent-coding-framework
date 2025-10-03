#!/usr/bin/env bash
set -euo pipefail
[ -f .env ] && set -a && . ./.env && set +a
. "$(dirname "$0")/org_helpers.sh"

ORG="${1:-}"
[ -n "$ORG" ] || { echo "Usage: $0 <org>"; exit 1; }

for cmd in talosctl kubectl yq; do command -v "$cmd" >/dev/null 2>&1 || { echo "Missing $cmd"; exit 1; }; done

NS_PREFIX="$(ns_prefix "$ORG")"
NS="${NS_PREFIX}-${ORG}"

if [ -n "${ORG_CONFIG_FILE:-}" ] && [ -f "${ORG_CONFIG_FILE}" ]; then
  CP_NODES=$(org_field "$ORG" '.talos.cpNodes[]?' | xargs || true)
  WORKER_NODES=$(org_field "$ORG" '.talos.workerNodes[]?' | xargs || true)
else
  UORG=$(echo "$ORG" | tr '[:lower:]' '[:upper:]')
  CP_NODES_VAR="${UORG}_CP_NODES"
  WORKER_NODES_VAR="${UORG}_WORKER_NODES"
  CP_NODES=${!CP_NODES_VAR:-}
  WORKER_NODES=${!WORKER_NODES_VAR:-}
fi

[ -n "${CP_NODES:-}" ] || { echo "No control-plane nodes for $ORG"; exit 1; }
CP1_IP=$(echo "$CP_NODES" | awk '{print $1}')

OUTDIR="_out/${ORG}"
mkdir -p "$OUTDIR"

if [ ! -f "${OUTDIR}/init.yaml" ]; then
  talosctl gen config "$ORG" "https://${CP1_IP}:6443" --output-dir "$OUTDIR"
fi

talosctl --nodes "$CP1_IP" apply-config --insecure --file "${OUTDIR}/init.yaml" || true

if [ "$(echo "$CP_NODES" | wc -w | tr -d ' ')" -gt 1 ]; then
  for NODE in $CP_NODES; do
    [ "$NODE" = "$CP1_IP" ] && continue
    talosctl --nodes "$NODE" apply-config --insecure --file "${OUTDIR}/controlplane.yaml" || true
  done
fi

for NODE in ${WORKER_NODES:-}; do
  talosctl --nodes "$NODE" apply-config --insecure --file "${OUTDIR}/join.yaml" || true
done

talosctl --endpoints "$CP1_IP" bootstrap || true

KCFG="${HOME}/.kube/${ORG}.config"
talosctl kubeconfig --endpoints "$CP1_IP" --force --nodes "$CP1_IP" --merge=false --force-context-name "$ORG" --output "$KCFG"

KUBECONFIG="$KCFG" kubectl create namespace "$NS" --dry-run=client -o yaml | KUBECONFIG="$KCFG" kubectl apply -f -
KUBECONFIG="$KCFG" kubectl get nodes -o wide
echo "Kubeconfig: $KCFG (context: $ORG)"
