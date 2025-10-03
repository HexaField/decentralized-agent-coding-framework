#!/usr/bin/env bash
set -euo pipefail
./scripts/install_prereqs.sh
./scripts/start_orchestrator.sh up
echo "Open the dashboard and use the Setup Wizard to join/create a network and manage orgs dynamically."
