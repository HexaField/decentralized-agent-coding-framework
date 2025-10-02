.PHONY: build images up down test:local test:multi clean

build:
	@docker build -f docker/orchestrator.Dockerfile -t mvp-orchestrator:$(or IMAGE_TAG) .
	@docker build -f docker/agent.Dockerfile -t mvp-agent:$(or IMAGE_TAG) .

images: build

up:
	@./scripts/start_orchestrator.sh

down:
	@docker compose -f compose/docker-compose.orchestrator.yml down || true

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
