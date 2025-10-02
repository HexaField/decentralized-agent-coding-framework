#!/usr/bin/env bash
set -euo pipefail
ORG=${1:-}
TASK=${2:-"Demo task"}
if [[ -z "$ORG" ]]; then echo "Usage: $0 <org> [task]"; exit 1; fi
NAME="org-$ORG"

export KUBECONFIG=$(k3d kubeconfig write "$NAME")
AGENT_NAME="agent-$(date +%s)"
NAMESPACE="mvp-agents"
kubectl create ns "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

cat > /tmp/agent-deploy.yaml <<YAML
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${AGENT_NAME}
  namespace: ${NAMESPACE}
spec:
  replicas: 1
  selector:
    matchLabels: { app: ${AGENT_NAME} }
  template:
    metadata:
      labels: { app: ${AGENT_NAME} }
    spec:
      containers:
      - name: agent
        image: mvp-agent:${IMAGE_TAG:-latest}
        env:
        - { name: ORG_NAME, value: "${ORG}" }
        - { name: TASK_TEXT, value: "${TASK}" }
        - { name: CODE_SERVER_PASSWORD, value: "password" }
        ports:
        - containerPort: 8443
---
apiVersion: v1
kind: Service
metadata:
  name: ${AGENT_NAME}
  namespace: ${NAMESPACE}
spec:
  selector: { app: ${AGENT_NAME} }
  type: ClusterIP
  ports:
  - port: 8443
    targetPort: 8443
YAML

kubectl apply -f /tmp/agent-deploy.yaml
echo "Deployed ${AGENT_NAME} to ${NAME}/${NAMESPACE}"
echo "Use ./scripts/open_code_server.sh ${ORG} ${AGENT_NAME} to access code-server"
