#!/usr/bin/env bash
set -euo pipefail
# Load .env from repo root if present
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "${ROOT_DIR}/.env" ] && set -a && . "${ROOT_DIR}/.env" && set +a

orgs_list() {
  if [ -n "${ORG_CONFIG_FILE:-}" ] && [ -f "${ORG_CONFIG_FILE}" ]; then
    if command -v yq >/dev/null 2>&1; then
      yq -r '.orgs[].name' "${ORG_CONFIG_FILE}"
    else
      echo "yq is required to read ${ORG_CONFIG_FILE}. Please run install_prereqs.sh or preflight." >&2
      return 1
    fi
  elif [ -n "${ORGS:-}" ]; then
    for o in ${ORGS}; do echo "$o"; done
  else
    echo "No orgs defined. Set ORG_CONFIG_FILE or ORGS." >&2
    return 1
  fi
}

org_field() {
  local org="$1" path="$2"
  [ -n "${ORG_CONFIG_FILE:-}" ] && [ -f "${ORG_CONFIG_FILE}" ] || { echo "ORG_CONFIG_FILE not set or missing" >&2; return 1; }
  command -v yq >/dev/null 2>&1 || { echo "yq required" >&2; return 1; }
  yq -r ".orgs[] | select(.name==\"${org}\") | ${path} // \"\"" "${ORG_CONFIG_FILE}"
}

ns_prefix() {
  local org="$1"
  local from_cfg
  from_cfg=$(org_field "$org" '.namespacePrefix' || true)
  echo "${from_cfg:-${NAMESPACE_PREFIX:-org}}"
}
