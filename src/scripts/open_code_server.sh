#!/usr/bin/env bash
set -euo pipefail

ORG=${1:-}
AGENT=${2:-}
LOCAL_PORT=${3:-}

if [[ -z "$ORG" || -z "$AGENT" ]]; then
	echo "Usage: $0 <org> <agent-service-name> [local-port]"; exit 1
fi

NAME="org-$ORG"
export KUBECONFIG=$(k3d kubeconfig write "$NAME")

# Ensure the service exists
if ! kubectl -n mvp-agents get svc "${AGENT}" >/dev/null 2>&1; then
	echo "Service '${AGENT}' not found in namespace mvp-agents. Available services:" >&2
	kubectl -n mvp-agents get svc >&2 || true
	exit 1
fi

is_port_free() {
	local p="$1"
	if command -v lsof >/dev/null 2>&1; then
		! lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1
	else
		python3 - "$p" <<'PY'
import socket, sys
p=int(sys.argv[1])
s=socket.socket()
try:
		s.bind(("127.0.0.1", p))
		ok=True
except OSError:
		ok=False
finally:
		try: s.close()
		except Exception: pass
print("OK" if ok else "BUSY")
PY
	fi
}

pick_port() {
	# If user provided a port, respect it (and error if busy)
	if [[ -n "${LOCAL_PORT}" ]]; then
		if [[ "$(is_port_free "${LOCAL_PORT}")" == "OK" || $? -eq 0 ]]; then
			echo "${LOCAL_PORT}"; return 0
		else
			echo "Requested port ${LOCAL_PORT} is busy." >&2; exit 1
		fi
	fi
	# Try 8443 first, then a small range
	for p in 8443 {8444..8499}; do
		if [[ "$(is_port_free "$p")" == "OK" || $? -eq 0 ]]; then echo "$p"; return 0; fi
	done
	# Fallback: random free port from OS
	python3 - <<'PY'
import socket
s=socket.socket(); s.bind(("127.0.0.1",0))
print(s.getsockname()[1])
s.close()
PY
}

PORT=$(pick_port)
echo "Port-forwarding ${AGENT} on 127.0.0.1:${PORT} (remote:8443)"
echo "Open http://127.0.0.1:${PORT}  (default password: 'password')"
kubectl -n mvp-agents port-forward "svc/${AGENT}" "${PORT}:8443"
