#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
[ -f "${ROOT_DIR}/.env" ] && (cd "${ROOT_DIR}" && set -a && . ./.env && set +a)

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
    if [ -n "${HEADSCALE_SSH:-}" ]; then "${SCRIPT_DIR}/hs_bootstrap_external.sh"; else "${SCRIPT_DIR}/hs_bootstrap_local.sh"; fi ;;
esac

# Attempt to join the tailnet on this host if variables are provided
if [[ -n "${HEADSCALE_URL:-}" && -n "${TS_AUTHKEY:-}" && -n "${TS_HOSTNAME:-}" ]]; then
  echo "Attempting to join Tailscale (Headscale) on this host..."
  if ! "${SCRIPT_DIR}/tailscale_join.sh"; then
    echo "Warning: tailscale_join failed; continuing setup. You can re-run src/scripts/tailscale_join.sh later." >&2
  fi
else
  echo "Skipping tailscale_join: HEADSCALE_URL/TS_AUTHKEY/TS_HOSTNAME not set in env." >&2
fi

"${SCRIPT_DIR}/start_orchestrator.sh" up || true

. "${SCRIPT_DIR}/org_helpers.sh"
for ORG in $(orgs_list); do
  "${SCRIPT_DIR}/talos_org_bootstrap.sh" "$ORG"
  echo "Note: Install Cilium for $ORG if not already installed (see docs)."
  "${SCRIPT_DIR}/install_tailscale_operator.sh" "$ORG"
  "${SCRIPT_DIR}/demo_app.sh" "$ORG"
done

echo "Setup finished."
