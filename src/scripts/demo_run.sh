#!/usr/bin/env bash
set -euo pipefail
./scripts/install_prereqs.sh
./scripts/tailscale_join.sh
for ORG in ${DEFAULT_ORGS:-acme}; do ./scripts/create_org_cluster.sh "$ORG"; done
./scripts/start_orchestrator.sh
./scripts/seed_demo_project.sh
./scripts/deploy_agent.sh ${DEFAULT_ORGS%% *} "Hello world web task"
