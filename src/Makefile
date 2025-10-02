.PHONY: build images up down logs test:local test:multi clean help build:orchestrator build:agent dash:install dash:dev

build:
	@docker build -f docker/orchestrator.Dockerfile -t mvp-orchestrator:$(or IMAGE_TAG) .
	@docker build -f docker/agent.Dockerfile -t mvp-agent:$(or IMAGE_TAG) .

images: build

up:
	@./scripts/start_orchestrator.sh

down:
	@docker compose -f compose/docker-compose.orchestrator.yml down || true

logs:
	@docker compose -f compose/docker-compose.orchestrator.yml logs -f --tail=200

build:orchestrator:
	@docker build -f docker/orchestrator.Dockerfile -t mvp-orchestrator:$(or IMAGE_TAG) .

build:agent:
	@docker build -f docker/agent.Dockerfile -t mvp-agent:$(or IMAGE_TAG) .

dash:install:
	@docker compose -f compose/docker-compose.orchestrator.yml run --rm dashboard sh -lc 'npm ci || npm install'

dash:dev:
	@docker compose -f compose/docker-compose.orchestrator.yml up dashboard

test\:local:
	@./scripts/create_org_cluster.sh acme
	@./scripts/start_orchestrator.sh
	@./scripts/seed_demo_project.sh
	@./scripts/deploy_agent.sh acme "Hello from test:local"
	@echo "Check dashboard for PR and task updates."

test\:multi:
	@./scripts/create_org_cluster.sh acme
	@./scripts/create_org_cluster.sh devrel
	@./scripts/start_orchestrator.sh
	@./scripts/deploy_agent.sh devrel "Remote placement test"
	@echo "Ensure peers configured in orchestrator example config."

clean:
	@./scripts/delete_org_cluster.sh acme || true
	@./scripts/delete_org_cluster.sh devrel || true
	@docker compose -f compose/docker-compose.orchestrator.yml down || true

help:
	@echo 'Targets:'
	@echo '  build              Build orchestrator and agent images'
	@echo '  build:orchestrator Build orchestrator image only'
	@echo '  build:agent        Build agent image only'
	@echo '  up                 Start orchestrator+dashboard'
	@echo '  down               Stop orchestrator+dashboard'
	@echo '  logs               Tail orchestrator+dashboard logs'
	@echo '  dash:install       Install dashboard deps in container'
	@echo '  dash:dev           Run dashboard container (dev)'
	@echo '  test:local         Quick local E2E'
	@echo '  test:multi         Multi-org smoke'
	@echo '  clean              Teardown local clusters and services'
