#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "$0")/org_helpers.sh"

: "${HEADSCALE_URL:?HEADSCALE_URL required (provided by dashboard)}"
: "${HEADSCALE_SSH:?HEADSCALE_SSH required (e.g., admin@host; provided by dashboard)}"

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
