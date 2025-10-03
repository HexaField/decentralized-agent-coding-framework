#!/usr/bin/env bash
set -euo pipefail
echo "Deprecated: agents are managed by the Kubernetes Operator via AgentTask CRDs."
echo "Schedule work instead (the Operator will reconcile the agent):"
echo "  - Use the Dashboard chat to create a task, or"
echo "  - POST to the Orchestrator: /schedule { org, task }"
exit 1
