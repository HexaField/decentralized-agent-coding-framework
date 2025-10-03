#!/usr/bin/env bash
set -euo pipefail
# Deploy an agent Pod into a Talos-managed org cluster and wire it to the orchestrator.
# Requires a per-org kubeconfig at ~/.kube/<org>.config and an image accessible to the cluster.
# Usage: deploy_agent_talos.sh <org> [image]
# Env (or .env in repo root):
#   ORCHESTRATOR_URL    e.g. http://<orchestrator-host>:18080 (reachable from cluster nodes)
#   ORCHESTRATOR_TOKEN  must match orchestrator's token
#   CODE_SERVER_PASSWORD (default: password)
#   CODE_SERVER_AUTH_HEADER (default: X-Agent-Auth)
#   CODE_SERVER_TOKEN (default: password)

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
[[ -f "$ROOT_DIR/.env" ]] && set -a && source "$ROOT_DIR/.env" && set +a

ORG=${1:-}
IMAGE=${2:-mvp-agent:latest}
if [[ -z "$ORG" ]]; then
  echo "Usage: $0 <org> [image]" >&2
  exit 1
fi

: "${ORCHESTRATOR_URL:?ORCHESTRATOR_URL is required (reachable from cluster)}"
: "${ORCHESTRATOR_TOKEN:?ORCHESTRATOR_TOKEN is required}"
CS_PASS=${CODE_SERVER_PASSWORD:-password}
CS_HDR=${CODE_SERVER_AUTH_HEADER:-X-Agent-Auth}
CS_TOK=${CODE_SERVER_TOKEN:-password}

# Resolve kubeconfig: prefer provided KUBECONFIG, then /state/kube/<org>.config, then ~/.kube/<org>.config
if [[ -n "${KUBECONFIG:-}" && -f "${KUBECONFIG}" ]]; then
  : # respect provided KUBECONFIG
else
  STATE_KCFG="/state/kube/${ORG}.config"
  HOME_KCFG="${HOME}/.kube/${ORG}.config"
  if [[ -f "$STATE_KCFG" ]]; then
    export KUBECONFIG="$STATE_KCFG"
  elif [[ -f "$HOME_KCFG" ]]; then
    export KUBECONFIG="$HOME_KCFG"
  else
    echo "Missing kubeconfig: $HOME_KCFG (also checked $STATE_KCFG)" >&2
    exit 1
  fi
fi

NS=mvp-agents
NAME="agent-${ORG}-$(date +%s)"

kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -

cat <<YAML | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${NAME}
  namespace: ${NS}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${NAME}
  template:
    metadata:
      labels:
        app: ${NAME}
    spec:
      containers:
      - name: agent
        image: ${IMAGE}
        imagePullPolicy: IfNotPresent
        env:
        - name: ORG_NAME
          value: "${ORG}"
        - name: ORCHESTRATOR_URL
          value: "${ORCHESTRATOR_URL}"
        - name: ORCHESTRATOR_TOKEN
          value: "${ORCHESTRATOR_TOKEN}"
        - name: CODE_SERVER_PASSWORD
          value: "${CS_PASS}"
        - name: CODE_SERVER_AUTH_HEADER
          value: "${CS_HDR}"
        - name: CODE_SERVER_TOKEN
          value: "${CS_TOK}"
        ports:
        - containerPort: 8443
        readinessProbe:
          tcpSocket: { port: 8443 }
          initialDelaySeconds: 2
          periodSeconds: 5
        livenessProbe:
          tcpSocket: { port: 8443 }
          initialDelaySeconds: 5
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: ${NAME}
  namespace: ${NS}
spec:
  selector:
    app: ${NAME}
  ports:
  - port: 8443
    targetPort: 8443
  type: ClusterIP
YAML

echo "Deployed ${NAME} to namespace ${NS} in org ${ORG}."
echo "The orchestrator will attempt to port-forward the Service and the dashboard will embed the editor."
