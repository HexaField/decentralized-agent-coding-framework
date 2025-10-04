#!/usr/bin/env bash
set -euo pipefail
[ -f .env ] && set -a && . ./.env && set +a

ORG="${1:-}"
[ -n "$ORG" ] || { echo "Usage: $0 <org>"; exit 1; }

for cmd in talosctl kubectl; do command -v "$cmd" >/dev/null 2>&1 || { echo "Missing $cmd"; exit 1; }; done

# Namespace prefix is now fixed to "org" unless overridden by env
NS_PREFIX="${NAMESPACE_PREFIX:-org}"
NS="${NS_PREFIX}-${ORG}"

# Expect node IP lists from environment or dashboard-supplied context
UORG=$(echo "$ORG" | tr '[:lower:]' '[:upper:]')
CP_NODES_VAR="${UORG}_CP_NODES"
WORKER_NODES_VAR="${UORG}_WORKER_NODES"
CP_NODES=${!CP_NODES_VAR:-}
WORKER_NODES=${!WORKER_NODES_VAR:-}

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

# Also copy kubeconfig into the shared state volume used by containers
if [[ -n "${GUILDNET_STATE_DIR:-}" ]]; then
  STATE_DIR="$GUILDNET_STATE_DIR"
elif [[ -n "${GUILDNET_HOME:-}" ]]; then
  STATE_DIR="$GUILDNET_HOME/state"
elif [[ "${GUILDNET_ENV:-}" == "dev" ]]; then
  STATE_DIR="${HOME:-/root}/.guildnetdev/state"
else
  STATE_DIR="${HOME:-/root}/.guildnet/state"
fi
mkdir -p "$STATE_DIR/kube"
cp -f "$KCFG" "$STATE_DIR/kube/${ORG}.config"
echo "Kubeconfig copied to $STATE_DIR/kube/${ORG}.config for orchestrator access"
