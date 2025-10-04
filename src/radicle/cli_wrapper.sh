#!/usr/bin/env bash
set -euo pipefail
if [[ -n "${GUILDNET_STATE_DIR:-}" ]]; then
	STATE_DIR="$GUILDNET_STATE_DIR"
elif [[ -n "${GUILDNET_HOME:-}" ]]; then
	STATE_DIR="$GUILDNET_HOME/state"
elif [[ "${GUILDNET_ENV:-}" == "dev" ]]; then
	STATE_DIR="${HOME:-/root}/.guildnetdev/state"
else
	STATE_DIR="${HOME:-/root}/.guildnet/state"
fi
mkdir -p "$STATE_DIR/radicle"
URL="radicle://pr/$(date +%s)"
echo "{\"url\":\"$URL\"}" > "$STATE_DIR/radicle/last_pr.json"
echo "radicle: opened PR at $URL"
