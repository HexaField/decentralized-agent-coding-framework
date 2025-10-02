#!/usr/bin/env bash
set -euo pipefail
echo "Starting code-server in background"
"$(dirname "$0")"/app/code_server/run_code_server.sh &
echo "Starting agent app"
exec /app/agent/app/agent
