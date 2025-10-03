#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
[ -f "${ROOT_DIR}/.env" ] && (cd "${ROOT_DIR}" && set -a && . ./.env && set +a)

MODE="${1:-auto}"  # auto|external|local

"${SCRIPT_DIR}/preflight.sh"

case "$MODE" in
  external)
    "${SCRIPT_DIR}/hs_bootstrap_external.sh" ;;
  local)
    "${SCRIPT_DIR}/hs_bootstrap_local.sh" ;;
  auto)
    if [ -n "${HEADSCALE_SSH:-}" ]; then "${SCRIPT_DIR}/hs_bootstrap_external.sh"; else "${SCRIPT_DIR}/hs_bootstrap_local.sh"; fi ;;
esac

"${SCRIPT_DIR}/start_orchestrator.sh" up || true

. "${SCRIPT_DIR}/org_helpers.sh"
for ORG in $(orgs_list); do
  "${SCRIPT_DIR}/talos_org_bootstrap.sh" "$ORG"
  echo "Note: Install Cilium for $ORG if not already installed (see docs)."
  "${SCRIPT_DIR}/install_tailscale_operator.sh" "$ORG"
  "${SCRIPT_DIR}/demo_app.sh" "$ORG"
done

echo "Setup finished."
