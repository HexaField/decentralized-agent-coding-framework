#!/usr/bin/env bash
set -euo pipefail
ORG=${1:-}
if [[ -z "$ORG" ]]; then echo "Usage: $0 <org>"; exit 1; fi
NAME="org-$ORG"
echo "Creating k3d cluster $NAME"
k3d cluster create "$NAME" --agents 1 --servers 1 --wait
export KUBECONFIG=$(k3d kubeconfig write "$NAME")
kubectl apply -f k8s/base/namespace.yaml
kubectl apply -f k8s/base/rbac.yaml
echo "Cluster $NAME ready. KUBECONFIG=$KUBECONFIG"
