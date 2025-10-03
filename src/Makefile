IMAGE_TAG ?= latest

.PHONY: build images up down logs test-local test-multi test go-build clean help build-orchestrator build-agent dash-install dash-dev

build:
	@docker build -f docker/orchestrator.Dockerfile -t mvp-orchestrator:$(IMAGE_TAG) .
	@docker build -f docker/agent.Dockerfile -t mvp-agent:$(IMAGE_TAG) .

images: build

up:
	@./scripts/start_orchestrator.sh

down:
	@docker compose -f compose/docker-compose.orchestrator.yml down || true

logs:
	@docker compose -f compose/docker-compose.orchestrator.yml logs -f --tail=200

build-orchestrator:
	@docker build -f docker/orchestrator.Dockerfile -t mvp-orchestrator:$(IMAGE_TAG) .

build-agent:
	@docker build -f docker/agent.Dockerfile -t mvp-agent:$(IMAGE_TAG) .

dash-install:
	@docker compose -f compose/docker-compose.orchestrator.yml run --rm dashboard sh -lc 'npm ci || npm install'

dash-dev:
	@docker compose -f compose/docker-compose.orchestrator.yml up dashboard

test-local:
	@./scripts/create_org_cluster.sh acme
	@./scripts/start_orchestrator.sh
	@./scripts/seed_demo_project.sh
	@echo "CRD mode: open dashboard and send a chat to schedule a task for org 'acme'. The Operator will deploy the agent."

test-multi:
	@./scripts/create_org_cluster.sh acme
	@./scripts/create_org_cluster.sh devrel
	@./scripts/start_orchestrator.sh
	@echo "CRD mode: schedule tasks via dashboard chat; ensure peers configured in orchestrator example config."

# Go build and tests (orchestrator)
go-build:
	@cd orchestrator/app && go build ./...

test:
	@cd orchestrator/app && go test ./...

clean:
	@./scripts/delete_org_cluster.sh acme || true
	@./scripts/delete_org_cluster.sh devrel || true
	@docker compose -f compose/docker-compose.orchestrator.yml down || true

help:
	@echo 'Targets:'
	@echo '  build               Build orchestrator and agent images'
	@echo '  build-orchestrator  Build orchestrator image only'
	@echo '  build-agent         Build agent image only'
	@echo '  go-build            Go build orchestrator locally'
	@echo '  test                Run orchestrator Go tests'
	@echo '  up                  Start orchestrator+dashboard'
	@echo '  down                Stop orchestrator+dashboard'
	@echo '  logs                Tail orchestrator+dashboard logs'
	@echo '  dash-install        Install dashboard deps in container'
	@echo '  dash-dev            Run dashboard container (dev)'
	@echo '  test-local          Quick local E2E'
	@echo '  test-multi          Multi-org smoke'
	@echo '  clean               Teardown local clusters and services'
