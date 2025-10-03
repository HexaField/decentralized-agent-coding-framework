#!/usr/bin/env bash
set -euo pipefail
[ -f .env ] && set -a && . ./.env && set +a

: "${HEADSCALE_URL:?HEADSCALE_URL required}"
: "${TS_AUTHKEY:?TS_AUTHKEY required}"
TS_HOSTNAME="${TS_HOSTNAME_PREFIX:-devlab}-$(hostname)"

install_ts() {
  if command -v tailscale >/dev/null 2>&1; then return; fi
  echo "Installing Tailscale..."
  case "$(uname -s)" in
    Darwin) command -v brew >/dev/null 2>&1 || { echo "Install Homebrew"; exit 1; }; brew install tailscale ;;
    Linux) curl -fsSL https://tailscale.com/install.sh | sh ;;
    *) echo "Unsupported OS"; exit 1 ;;
  esac
}

install_ts
sudo tailscaled >/dev/null 2>&1 || true
sudo tailscale up \
  --login-server "${HEADSCALE_URL}" \
  --authkey "${TS_AUTHKEY}" \
  --hostname "${TS_HOSTNAME}" \
  --accept-dns=false

echo "Joined tailnet: $(tailscale status --self | awk '{print $1,$2,$3}')"
echo "IPs: $(tailscale ip -4) $(tailscale ip -6 || true)"
