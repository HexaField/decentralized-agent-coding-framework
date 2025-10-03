#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "$0")/org_helpers.sh"

HEADSCALE_BIND_IP="${HEADSCALE_BIND_IP:-127.0.0.1}"
HEADSCALE_PORT="${HEADSCALE_PORT:-8080}"

is_port_free() { nc -z "${HEADSCALE_BIND_IP}" "$1" >/dev/null 2>&1 && return 1 || return 0; }

if ! is_port_free "$HEADSCALE_PORT"; then
  for p in $(seq $((HEADSCALE_PORT+1)) $((HEADSCALE_PORT+10))); do
    if is_port_free "$p"; then HEADSCALE_PORT="$p"; break; fi
  done
fi

export HEADSCALE_URL="http://${HEADSCALE_BIND_IP}:${HEADSCALE_PORT}"

echo "Starting local Headscale on ${HEADSCALE_BIND_IP}:${HEADSCALE_PORT}..."
docker rm -f headscale-local >/dev/null 2>&1 || true
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONF_DIR="${ROOT_DIR}/_tmp/headscale"
mkdir -p "${CONF_DIR}"
cat > "${CONF_DIR}/config.yaml" <<YAML
server_url: ${HEADSCALE_URL}
listen_addr: 0.0.0.0:8080
metrics_listen_addr: 127.0.0.1:9090
database:
  type: sqlite
  sqlite:
    path: /var/lib/headscale/db.sqlite
prefixes:
  v4: 100.64.0.0/10
  v6: fd7a:115c:a1e0::/48
derp:
  server:
    enabled: false
  urls:
    - https://controlplane.tailscale.com/derpmap/default
noise:
  private_key_path: /var/lib/headscale/noise_private.key
dns:
  override_local_dns: false
  magic_dns: false
YAML

docker run -d --name headscale-local \
  -p ${HEADSCALE_BIND_IP}:${HEADSCALE_PORT}:8080 \
  -v headscale-data:/var/lib/headscale \
  -v "${CONF_DIR}":/etc/headscale:ro \
  --restart unless-stopped \
  headscale/headscale:0.26.1 -c /etc/headscale/config.yaml serve

echo "Waiting for Headscale to respond at ${HEADSCALE_URL}..."
for i in {1..30}; do
  if curl -sSfL "${HEADSCALE_URL}/health" >/dev/null; then OK=1; break; fi
  sleep 1
done
if [ -z "${OK:-}" ]; then
  echo "Warning: Headscale health check failed; continuing in best-effort mode."
fi

echo "Creating users per org..."
for ORG in $(orgs_list); do
  docker run --rm --network container:headscale-local \
    -v headscale-data:/var/lib/headscale \
    -v "${CONF_DIR}":/etc/headscale:ro \
    headscale/headscale:0.26.1 -c /etc/headscale/config.yaml users create "${ORG}" || true
done

echo "Creating reusable pre-auth keys..."
for ORG in $(orgs_list); do
  KEY=$(docker run --rm --network container:headscale-local \
    -v headscale-data:/var/lib/headscale \
    -v "${CONF_DIR}":/etc/headscale:ro \
    headscale/headscale:0.26.1 -c /etc/headscale/config.yaml preauthkeys create --reusable --expiration 48h --user "${ORG}" \
    | awk '/key:/{print $2}')
  echo "Org: ${ORG}  TS_AUTHKEY=${KEY}"
done

docker run --rm --network container:headscale-local -v headscale-data:/var/lib/headscale -v "${CONF_DIR}":/etc/headscale:ro headscale/headscale:0.26.1 -c /etc/headscale/config.yaml users list || true
docker run --rm --network container:headscale-local -v headscale-data:/var/lib/headscale -v "${CONF_DIR}":/etc/headscale:ro headscale/headscale:0.26.1 -c /etc/headscale/config.yaml preauthkeys list || true

echo "Local Headscale bootstrap complete at ${HEADSCALE_URL}"
