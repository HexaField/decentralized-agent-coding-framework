#!/usr/bin/env bash
set -euo pipefail
[ -f .env ] && set -a && . ./.env && set +a

ORG="${1:-}"
[ -n "$ORG" ] || { echo "Usage: $0 <org>"; exit 1; }

# Require talosctl and kubectl
for cmd in talosctl kubectl; do command -v "$cmd" >/dev/null 2>&1 || { echo "Missing $cmd"; exit 1; }; done

# Create a small local Talos cluster if one isn't present. Uses talosctl cluster (v1.6+)
# Falls back to kind if available and talosctl cluster missing. The goal is to produce a kubeconfig at ~/.kube/${ORG}.config

# Detect state directory for copy-out
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

# Try talosctl cluster create
if talosctl cluster --help >/dev/null 2>&1; then
  NAME="${ORG}"
  # If cluster already exists, skip create
  if ! talosctl cluster list | grep -q "^${NAME}\b"; then
    echo "Creating local Talos cluster '${NAME}'..."
    talosctl cluster create "${NAME}" --workers 1 --controlplanes 1 --wait-timeout 10m
  else
    echo "Local Talos cluster '${NAME}' exists; skipping create"
  fi
  # Export kubeconfig
  KCFG="${HOME}/.kube/${ORG}.config"
  talosctl cluster kubeconfig "${NAME}" --force-context-name "${ORG}" --force --output "$KCFG"
  echo "Kubeconfig: $KCFG"
  cp -f "$KCFG" "$STATE_DIR/kube/${ORG}.config"
  echo "Kubeconfig copied to $STATE_DIR/kube/${ORG}.config"
  exit 0
fi

# Fallback: kind
if command -v kind >/dev/null 2>&1; then
  NAME="${ORG}"
  if ! kind get clusters | grep -q "^${NAME}$"; then
    echo "Creating kind cluster '${NAME}'..."
    kind create cluster --name "$NAME"
  else
    echo "kind cluster '${NAME}' exists; skipping create"
  fi
  KCFG="${HOME}/.kube/config"
  # Extract current context kubeconfig flattened
  kubectl config view --minify --flatten -o yaml >"${HOME}/.kube/${ORG}.config"
  cp -f "${HOME}/.kube/${ORG}.config" "$STATE_DIR/kube/${ORG}.config"
  echo "Kubeconfig copied to $STATE_DIR/kube/${ORG}.config"
  exit 0
fi

echo "No local provider available: talosctl cluster/kind not found" >&2
exit 1
