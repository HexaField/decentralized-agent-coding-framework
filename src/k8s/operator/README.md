# Agent Operator (CRD mode)

This folder contains manifests to install the AgentTask CRD and deploy the per-cluster operator.

- CRD: `crd-agenttask.yaml`
- RBAC: `serviceaccount.yaml`, `role.yaml`, `rolebinding.yaml`
- Deployment: `operator-deployment.yaml`
- Kustomize entrypoint: `kustomization.yaml`

Usage (example):

- Apply CRD and operator into namespace `mvp-agents` using Kustomize.
- Ensure the operator image `mvp-operator:latest` is available in the cluster or replace it.

Notes:
- The orchestrator in `crd-operator` mode will create `AgentTask` CRs in the `mvp-agents` namespace.
- The controller reconciles an agent Deployment/Service and updates status.