#!/usr/bin/env bash
set -euo pipefail
[[ -f .env ]] && set -o allexport && source .env && set +o allexport

if [[ -z "${HEADSCALE_URL:-}" || -z "${TS_AUTHKEY:-}" || -z "${TS_HOSTNAME:-}" ]]; then
  echo "HEADSCALE_URL, TS_AUTHKEY, TS_HOSTNAME must be set (see .env.example)."
  exit 1
fi

echo "Joining Tailscale via $HEADSCALE_URL as $TS_HOSTNAME"
sudo tailscale up --login-server="$HEADSCALE_URL" --authkey="$TS_AUTHKEY" \
  --hostname="$TS_HOSTNAME" --accept-dns=false --ssh
echo "Tailscale status:"
tailscale status
