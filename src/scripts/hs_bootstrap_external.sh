#!/usr/bin/env bash
set -euo pipefail

: "${HEADSCALE_URL:?HEADSCALE_URL required (provided by dashboard)}"
: "${HEADSCALE_SSH:?HEADSCALE_SSH required (e.g., admin@host; provided by dashboard)}"

curl -sSfL "${HEADSCALE_URL}/health" >/dev/null || { echo "Headscale not reachable at ${HEADSCALE_URL}"; exit 1; }
ssh -o StrictHostKeyChecking=accept-new "${HEADSCALE_SSH}" "headscale version" || { echo "SSH to headscale host failed"; exit 1; }

echo "External Headscale reachable; org/key creation will be initiated by the dashboard when needed."

echo "Headscale bootstrap complete"
