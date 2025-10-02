#!/usr/bin/env bash
set -euo pipefail
PASS=${CODE_SERVER_PASSWORD:-password}
export PASSWORD="$PASS"
exec code-server --bind-addr 0.0.0.0:8443 --auth password --disable-telemetry /workspace
