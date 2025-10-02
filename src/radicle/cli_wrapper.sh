#!/usr/bin/env bash
set -euo pipefail
mkdir -p /state/radicle
URL="radicle://pr/$(date +%s)"
echo "{\"url\":\"$URL\"}" > /state/radicle/last_pr.json
echo "radicle: opened PR at $URL"
