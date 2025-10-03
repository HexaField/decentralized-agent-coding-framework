#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
[ -f "${SCRIPT_DIR}/../.env" ] && (cd "${SCRIPT_DIR}/.." && set -a && . ./.env && set +a)

"${SCRIPT_DIR}/preflight.sh"
"${SCRIPT_DIR}/hs_bootstrap_external.sh"

# Start orchestrator and dashboard via existing script
"${SCRIPT_DIR}/start_orchestrator.sh" up || true

echo "Per-org bootstrap is now driven by the dashboard. Run talos_org_bootstrap.sh/install_tailscale_operator.sh/demo_app.sh with an explicit org if needed."
