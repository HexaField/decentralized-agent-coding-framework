#!/usr/bin/env bash
set -euo pipefail
ORG=${1:-}
AGENT=${2:-}
if [[ -z "$ORG" || -z "$AGENT" ]]; then echo "Usage: $0 <org> <agent-name>"; exit 1; fi
NAME="org-$ORG"
export KUBECONFIG=$(k3d kubeconfig write "$NAME")
echo "Port-forwarding ${AGENT} on 127.0.0.1:8443"
kubectl -n mvp-agents port-forward svc/${AGENT} 8443:8443
