#!/usr/bin/env bash
set -euo pipefail
tailscale status
echo "Self: $(tailscale status --self)"
echo "IPs:  $(tailscale ip -4) $(tailscale ip -6 || true)"
echo "Routes:"
tailscale status --json | jq -r '.Peer[]?.PrimaryRoutes? // empty'
