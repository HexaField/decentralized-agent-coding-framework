#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
[ -f "${SCRIPT_DIR}/../.env" ] && (cd "${SCRIPT_DIR}/.." && set -a && . ./.env && set +a)

"${SCRIPT_DIR}/preflight.sh"
"${SCRIPT_DIR}/hs_bootstrap_external.sh"

. "${SCRIPT_DIR}/org_helpers.sh"

# Start orchestrator and dashboard via existing script
"${SCRIPT_DIR}/start_orchestrator.sh" up || true

for ORG in $(orgs_list); do
  "${SCRIPT_DIR}/talos_org_bootstrap.sh" "$ORG"
  # Cilium install may be required after Talos bootstrap (manual or scripted elsewhere)
  "${SCRIPT_DIR}/install_tailscale_operator.sh" "$ORG"
  "${SCRIPT_DIR}/demo_app.sh" "$ORG"
done

echo "Unified setup complete."
