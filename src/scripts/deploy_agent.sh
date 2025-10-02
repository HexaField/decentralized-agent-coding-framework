#!/usr/bin/env bash
set -euo pipefail
ORG=${1:-}
TASK=${2:-"Demo task"}
if [[ -z "$ORG" ]]; then echo "Usage: $0 <org> [task]"; exit 1; fi
NAME="org-$ORG"

# Generate a kubeconfig whose server URL is reachable from containers
K3D_API_HOST=${K3D_API_HOST:-host.docker.internal}
TMP_KUBECONFIG="/tmp/kubeconfig-${NAME}"
# Get kubeconfig and rewrite server host from 0.0.0.0/127.0.0.1 to a container-reachable host
k3d kubeconfig get "$NAME" > "$TMP_KUBECONFIG"
sed -i "s#server: https://0\\.0\\.0\\.0:#server: https://${K3D_API_HOST}:#" "$TMP_KUBECONFIG" || true
sed -i "s#server: https://127\\.0\\.0\\.1:#server: https://${K3D_API_HOST}:#" "$TMP_KUBECONFIG" || true
export KUBECONFIG="$TMP_KUBECONFIG"

# In dev, the API cert SANs won't match host.docker.internal; relax verification
sed -i 's#^\([[:space:]]*\)certificate-authority-data:.*#\1insecure-skip-tls-verify: true#' "$TMP_KUBECONFIG" || true

# Fast preflight to fail early if API is unreachable
kubectl version --request-timeout=5s >/dev/null
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
        imagePullPolicy: Never
        env:
        - { name: ORG_NAME, value: "${ORG}" }
        - { name: TASK_TEXT, value: "${TASK}" }
        - { name: ORCHESTRATOR_URL, value: "http://host.k3d.internal:18080" }
        - { name: ORCHESTRATOR_TOKEN, valueFrom: { secretKeyRef: { name: orchestrator-token, key: token } } }
        - { name: CODE_SERVER_PASSWORD, value: "password" }
        - { name: CODE_SERVER_AUTH_HEADER, value: "X-Agent-Auth" }
        - { name: CODE_SERVER_TOKEN, value: "agent-secret" }
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
# Create secret for orchestrator token if not exists (best-effort)
kubectl -n ${NAMESPACE} create secret generic orchestrator-token --from-literal=token="${ORCHESTRATOR_TOKEN:-}" --dry-run=client -o yaml | kubectl apply -f -
echo "Deployed ${AGENT_NAME} to ${NAME}/${NAMESPACE}"
echo "Use ./scripts/open_code_server.sh ${ORG} ${AGENT_NAME} to access code-server"
