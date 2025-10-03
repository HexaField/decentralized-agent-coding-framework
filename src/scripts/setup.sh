#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

MODE="${1:-auto}"  # auto|external|local

# Prefer a default orgs config if none provided
REPO_ROOT="$(cd "${ROOT_DIR}/.." && pwd)"
if [ -z "${ORG_CONFIG_FILE:-}" ]; then
  if [ -f "${REPO_ROOT}/orgs.yaml" ]; then
    export ORG_CONFIG_FILE="${REPO_ROOT}/orgs.yaml"
  elif [ -f "${REPO_ROOT}/orgs.example.yaml" ]; then
    export ORG_CONFIG_FILE="${REPO_ROOT}/orgs.example.yaml"
  fi
fi

"${SCRIPT_DIR}/preflight.sh"

case "$MODE" in
  external)
    "${SCRIPT_DIR}/hs_bootstrap_external.sh" ;;
  local)
    "${SCRIPT_DIR}/hs_bootstrap_local.sh" ;;
  auto)
    "${SCRIPT_DIR}/hs_bootstrap_local.sh" ;;
esac

# Attempt to join the tailnet on this host if variables are provided
echo "Skipping tailscale_join: configuration is driven by the dashboard setup flow."

"${SCRIPT_DIR}/start_orchestrator.sh" up || true

. "${SCRIPT_DIR}/org_helpers.sh"
for ORG in $(orgs_list); do
  "${SCRIPT_DIR}/talos_org_bootstrap.sh" "$ORG"
  echo "Note: Install Cilium for $ORG if not already installed (see docs)."
  "${SCRIPT_DIR}/install_tailscale_operator.sh" "$ORG"
  "${SCRIPT_DIR}/demo_app.sh" "$ORG"
done

echo "Setup finished."
