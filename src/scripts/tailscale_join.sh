#!/usr/bin/env bash
set -euo pipefail

# Resolve repo/src roots so this script works from any CWD
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)" # points to src/
REPO_ROOT="$(cd "${ROOT_DIR}/.." && pwd)"

# Load env from src/.env (preferred) or repo/.env
if [[ -f "${ROOT_DIR}/.env" ]]; then
  ( set -o allexport; source "${ROOT_DIR}/.env"; set +o allexport )
elif [[ -f "${REPO_ROOT}/.env" ]]; then
  ( set -o allexport; source "${REPO_ROOT}/.env"; set +o allexport )
elif [[ -f ./.env ]]; then
  ( set -o allexport; source ./.env; set +o allexport )
fi

# Validate required vars
if [[ -z "${HEADSCALE_URL:-}" || -z "${TS_AUTHKEY:-}" || -z "${TS_HOSTNAME:-}" ]]; then
  echo "HEADSCALE_URL, TS_AUTHKEY, TS_HOSTNAME must be set (see src/.env.example)." >&2
  echo "Hint: cp src/.env.example src/.env and edit with your Headscale URL and auth key." >&2
  exit 1
fi

# Guard against placeholder/example values
if [[ "${HEADSCALE_URL}" == *example.com* ]] || [[ "${TS_AUTHKEY}" == tskey-abc* ]]; then
  echo "Refusing to join with placeholder values. Please edit src/.env with real HEADSCALE_URL and TS_AUTHKEY." >&2
  exit 1
fi

# Ensure tailscale CLI exists; try to install via prereqs helper
if ! command -v tailscale >/dev/null 2>&1; then
  echo "tailscale CLI not found. Attempting to install via install_prereqs.sh..." >&2
  if [[ -x "${SCRIPT_DIR}/install_prereqs.sh" ]]; then
    "${SCRIPT_DIR}/install_prereqs.sh" || true
  fi
  if ! command -v tailscale >/dev/null 2>&1; then
    echo "tailscale CLI still not found. Please install tailscale and re-run." >&2
    exit 1
  fi
fi

echo "Joining Tailscale via ${HEADSCALE_URL} as ${TS_HOSTNAME}"
sudo tailscale up --login-server="${HEADSCALE_URL}" --authkey="${TS_AUTHKEY}" \
  --hostname="${TS_HOSTNAME}" --accept-dns=false --ssh
echo "Tailscale status:"
tailscale status
