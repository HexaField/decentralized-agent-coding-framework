#!/usr/bin/env bash
set -euo pipefail

# Resolve script dir for optional helpers
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Validate required vars
if [[ -z "${HEADSCALE_URL:-}" || -z "${TS_AUTHKEY:-}" || -z "${TS_HOSTNAME:-}" ]]; then
  echo "HEADSCALE_URL, TS_AUTHKEY, TS_HOSTNAME must be provided by the dashboard server." >&2
  echo "This script no longer reads .env files; launch it via the dashboard setup flow." >&2
  exit 1
fi

# Guard against placeholder/example values
if [[ "${HEADSCALE_URL}" == *example.com* ]] || [[ "${TS_AUTHKEY}" == tskey-abc* ]]; then
  echo "Refusing to join with placeholder/example values. Provide real HEADSCALE_URL and TS_AUTHKEY from the dashboard." >&2
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

# Prefer non-interactive sudo; fall back to direct if permitted. Fail fast if sudo would prompt.
RUN_UP=(tailscale up --login-server="${HEADSCALE_URL}" --authkey="${TS_AUTHKEY}" \
  --hostname="${TS_HOSTNAME}" --accept-dns=false --ssh)

if command -v sudo >/dev/null 2>&1; then
  if sudo -n true 2>/dev/null; then
    if ! sudo -n "${RUN_UP[@]}"; then
      echo "tailscale up failed (sudo)." >&2
      exit 1
    fi
  else
    # No passwordless sudo; avoid hanging on prompt
    echo "sudo requires a password; cannot run tailscale up non-interactively. Grant passwordless sudo or run from Dashboard 'connect' with existing key." >&2
    exit 1
  fi
else
  if ! "${RUN_UP[@]}"; then
    echo "tailscale up failed." >&2
    exit 1
  fi
fi

# Poll for connectivity up to 60s to avoid indefinite hang
DEADLINE=$((SECONDS + 60))
CONNECTED=0
while (( SECONDS < DEADLINE )); do
  if out=$(tailscale status --json 2>/dev/null); then
    if echo "$out" | grep -q '"Self"'; then
      CONNECTED=1; break
    fi
  fi
  sleep 2
done

if (( CONNECTED == 0 )); then
  echo "tailscale did not connect within timeout" >&2
  exit 1
fi

echo "Tailscale connected."
