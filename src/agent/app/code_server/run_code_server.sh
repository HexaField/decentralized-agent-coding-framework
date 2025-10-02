#!/usr/bin/env bash
set -euo pipefail
mkdir -p /workspace
PASS=${CODE_SERVER_PASSWORD:-password}
export PASSWORD="$PASS"
if command -v code-server >/dev/null 2>&1; then
	exec code-server --bind-addr 0.0.0.0:8443 --auth password --disable-telemetry /workspace
else
	echo "code-server not found; starting python http.server fallback on :8443"
	cd /workspace
	exec python3 -m http.server 8443 --bind 0.0.0.0
fi
