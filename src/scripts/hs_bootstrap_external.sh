#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "${ROOT_DIR}/.env" ] && set -a && . "${ROOT_DIR}/.env" && set +a
. "$(dirname "$0")/org_helpers.sh"

: "${HEADSCALE_URL:?HEADSCALE_URL required}"
: "${HEADSCALE_SSH:?HEADSCALE_SSH required (e.g., admin@host)}"

curl -sSfL "${HEADSCALE_URL}/health" >/dev/null || { echo "Headscale not reachable at ${HEADSCALE_URL}"; exit 1; }
ssh -o StrictHostKeyChecking=accept-new "${HEADSCALE_SSH}" "headscale version" || { echo "SSH to headscale host failed"; exit 1; }

for ORG in $(orgs_list); do
  ssh -o StrictHostKeyChecking=accept-new "${HEADSCALE_SSH}" "sudo headscale namespaces create ${ORG}" || true
done

for ORG in $(orgs_list); do
  KEY=$(ssh -o StrictHostKeyChecking=accept-new "${HEADSCALE_SSH}" \
    "sudo headscale preauthkeys create --reusable --expiration 48h ${ORG} | awk '/key:/{print $2}'")
  echo "Org: ${ORG}  TS_AUTHKEY=${KEY}"
done

ssh -o StrictHostKeyChecking=accept-new "${HEADSCALE_SSH}" "sudo headscale namespaces list"
ssh -o StrictHostKeyChecking=accept-new "${HEADSCALE_SSH}" "sudo headscale preauthkeys list"

echo "Headscale bootstrap complete"
