#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT_DIR"
[[ -f .env ]] && set -o allexport && source .env && set +o allexport

# Option flags
CMD=${1:-up}

case "$CMD" in
	down)
		docker compose -f compose/docker-compose.orchestrator.yml down -v
		;;
	rebuild)
		docker compose -f compose/docker-compose.orchestrator.yml build --no-cache orchestrator
		docker compose -f compose/docker-compose.orchestrator.yml up -d orchestrator
		;;
	up)
		docker compose -f compose/docker-compose.orchestrator.yml up -d --build
		;;
	*)
		echo "Usage: $0 [up|down|rebuild]"; exit 1;;
esac

echo "Orchestrator: http://127.0.0.1:18080/health"
echo "Dashboard:    http://127.0.0.1:8443"
echo "Logs: docker compose -f compose/docker-compose.orchestrator.yml logs -f orchestrator dashboard"
