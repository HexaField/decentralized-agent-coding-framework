#!/usr/bin/env bash
set -euo pipefail
STATE_DIR="${HOME:-/root}/.guildnet/state"
mkdir -p "$STATE_DIR/radicle"
URL="radicle://pr/$(date +%s)"
echo "{\"url\":\"$URL\"}" > "$STATE_DIR/radicle/last_pr.json"
echo "radicle: opened PR at $URL"
