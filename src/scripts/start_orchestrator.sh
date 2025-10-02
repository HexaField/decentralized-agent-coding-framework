#!/usr/bin/env bash
set -euo pipefail
[[ -f .env ]] && set -o allexport && source .env && set +o allexport

docker compose -f compose/docker-compose.orchestrator.yml up -d --build
echo "Orchestrator running at http://127.0.0.1:8080/health"
echo "Dashboard running at http://127.0.0.1:8090"
