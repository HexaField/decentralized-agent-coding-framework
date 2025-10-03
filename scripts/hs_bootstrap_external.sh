#!/usr/bin/env bash
set -euo pipefail
[ -f .env ] && set -a && . ./.env && set +a
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
. "${SCRIPT_DIR}/org_helpers.sh"

: "${HEADSCALE_URL:?HEADSCALE_URL required}"
: "${HEADSCALE_SSH:?HEADSCALE_SSH required (e.g., admin@host)}"

echo "Checking Headscale reachability..."
curl -sSfL "${HEADSCALE_URL}/health" >/dev/null || { echo "Headscale not reachable at ${HEADSCALE_URL}"; exit 1; }
ssh -o StrictHostKeyChecking=accept-new "${HEADSCALE_SSH}" "headscale version" || { echo "SSH to headscale host failed"; exit 1; }

echo "Creating namespaces per org..."
for ORG in $(orgs_list); do
  ssh -o StrictHostKeyChecking=accept-new "${HEADSCALE_SSH}" \
    "sudo headscale namespaces create ${ORG}" || true
done

echo "Creating reusable pre-auth keys..."
for ORG in $(orgs_list); do
  KEY=$(ssh -o StrictHostKeyChecking=accept-new "${HEADSCALE_SSH}" \
    "sudo headscale preauthkeys create --reusable --expiration 48h ${ORG} | awk '/key:/{print $2}'")
  echo "Org: ${ORG}  TS_AUTHKEY=${KEY}"
done

ssh -o StrictHostKeyChecking=accept-new "${HEADSCALE_SSH}" "sudo headscale namespaces list"
ssh -o StrictHostKeyChecking=accept-new "${HEADSCALE_SSH}" "sudo headscale preauthkeys list"

echo "External Headscale bootstrap complete."
