#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
[ -f "${SCRIPT_DIR}/../.env" ] && set -a && . "${SCRIPT_DIR}/../.env" && set +a

# Flags to optionally skip parts for airgapped or staged setups
SKIP_HEADSCALE=${SKIP_HEADSCALE:-0}
SKIP_TALOS=${SKIP_TALOS:-0}
SKIP_OPERATOR=${SKIP_OPERATOR:-0}
SKIP_DEMO=${SKIP_DEMO:-0}

"${SCRIPT_DIR}/preflight.sh"

# Ensure org config present
if [ -z "${ORG_CONFIG_FILE:-}" ]; then
  ORG_CONFIG_FILE="orgs.yaml"
  export ORG_CONFIG_FILE
fi
if [ ! -f "${ORG_CONFIG_FILE}" ] && [ -f "${SCRIPT_DIR}/../orgs.example.yaml" ]; then
  cp "${SCRIPT_DIR}/../orgs.example.yaml" "${ORG_CONFIG_FILE}"
  echo "Created ${ORG_CONFIG_FILE} from orgs.example.yaml — edit node IPs before proceeding."
fi

# Headscale bootstrap (External)
if [ "${SKIP_HEADSCALE}" != "1" ]; then
  if [ -z "${HEADSCALE_URL:-}" ] || [ -z "${HEADSCALE_SSH:-}" ]; then
    echo "HEADSCALE_URL or HEADSCALE_SSH not set. Skipping Headscale bootstrap. Set SKIP_HEADSCALE=1 to hide this notice."
  else
    "${SCRIPT_DIR}/hs_bootstrap_external.sh"
  fi
fi

. "${SCRIPT_DIR}/org_helpers.sh"

for ORG in $(orgs_list); do
  if [ "${SKIP_TALOS}" != "1" ]; then
    "${SCRIPT_DIR}/talos_org_bootstrap.sh" "$ORG"
  fi
  if [ "${SKIP_OPERATOR}" != "1" ]; then
    "${SCRIPT_DIR}/install_tailscale_operator.sh" "$ORG"
  fi
  if [ "${SKIP_DEMO}" != "1" ]; then
    "${SCRIPT_DIR}/demo_app.sh" "$ORG"
  fi
done

echo "Setup complete."
