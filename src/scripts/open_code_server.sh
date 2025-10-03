#!/usr/bin/env bash
set -euo pipefail

ORG=${1:-}
AGENT=${2:-}
PORT=${3:-}

echo "Deprecated for Talos mode. Use orchestrator editor proxy or direct kubectl with Talos kubeconfig:"
echo "- Orchestrator proxy: POST /agents/editor/open { name, org } then browse /editor/proxy/{port}/"
echo "- Direct: KUBECONFIG=~/.kube/${ORG}.config kubectl -n mvp-agents port-forward svc/${AGENT} ${PORT:-8443}:8443"
exit 1
