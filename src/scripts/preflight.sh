#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "${ROOT_DIR}/.env" ] && set -a && . "${ROOT_DIR}/.env" && set +a

OS=$(uname -s)
need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1"; return 1; }; }

# Use existing installer if present
if [ -x "$(dirname "$0")/install_prereqs.sh" ]; then
  "$(dirname "$0")/install_prereqs.sh" || true
fi

MISSING=0
for c in docker kubectl helm ssh; do
  if ! command -v "$c" >/dev/null 2>&1; then
    if [ "$OS" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
      case "$c" in
        kubectl) brew install kubernetes-cli || true ;;
        helm) brew install helm || true ;;
      esac
    fi
  fi
  need "$c" || MISSING=1
done
for c in yq jq talosctl cilium; do
  if ! command -v "$c" >/dev/null 2>&1; then
    if [ "$OS" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
      case "$c" in yq|jq|cilium) brew install "$c" ;; talosctl) brew install siderolabs/tap/talosctl ;; esac || true
    fi
  fi
  need "$c" || MISSING=1
done

if [ "$MISSING" -ne 0 ]; then
  echo "Prerequisites missing. Please install the tools above and re-run." >&2
  exit 1
fi

echo "Preflight OK"
