#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

MODE="${1:-auto}"  # auto|external|local

"${SCRIPT_DIR}/preflight.sh"

case "$MODE" in
  external)
    "${SCRIPT_DIR}/hs_bootstrap_external.sh" ;;
  local|auto)
    "${SCRIPT_DIR}/hs_bootstrap_local.sh" ;;
esac

echo "Tailscale join and per-org actions are handled by the dashboard setup flow."

"${SCRIPT_DIR}/start_orchestrator.sh" up || true

echo "Setup finished. Access the dashboard to continue."
