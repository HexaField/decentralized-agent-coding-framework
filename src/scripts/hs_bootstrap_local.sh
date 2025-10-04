#!/usr/bin/env bash
set -euo pipefail

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
HOME_DIR="${HOME:-/root}"
# Determine state dir (dev vs prod)
if [[ -n "${GUILDNET_STATE_DIR:-}" ]]; then
  STATE_DIR="$GUILDNET_STATE_DIR"
elif [[ -n "${GUILDNET_HOME:-}" ]]; then
  STATE_DIR="$GUILDNET_HOME/state"
elif [[ "${GUILDNET_ENV:-}" == "dev" ]]; then
  STATE_DIR="${HOME_DIR}/.guildnetdev/state"
else
  STATE_DIR="${HOME_DIR}/.guildnet/state"
fi
CONF_DIR="${STATE_DIR}/_tmp/headscale"
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

# A separate CLI config used by headscale CLI inside the container namespace, where the
# server is reachable at 127.0.0.1:8080 regardless of the host-mapped port.
cat > "${CONF_DIR}/cli.yaml" <<YAML
server_url: http://127.0.0.1:8080
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

# Note: Headscale CLI readiness is validated by the dashboard service with retries to avoid long blocking here.

echo "Local Headscale bootstrap complete at ${HEADSCALE_URL}"

# Persist discovered URL for dashboard server auto-discovery
echo -n "${HEADSCALE_URL}" > "${CONF_DIR}/url" || true
