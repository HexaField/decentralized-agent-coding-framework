# Tasks: Decentralized Orchestrator & Local Dev

Input: Design docs in `/specs/` and `architecture.md`
Prerequisites: `IMPLEMENTATION_PLAN.md`, contracts to be defined in OpenAPI, backlog merged

## Phase 3.1: Setup

- [ ] T001 Create orchestrator modules scaffold in backend/src/orchestrator/ (capacity.ts, scheduler.ts, k8s.ts, peers.ts, policies.ts)
- [ ] T002 Initialize Kubernetes client dependencies and types in backend/package.json (add @kubernetes/client-node)
- [ ] T003 [P] Configure validation and schema tooling (zod) and error middleware in backend/src/middleware/validation.ts
- [ ] T004 [P] Extend ESLint/Vitest configs to cover new TS folders and rules in backend/.eslintrc.json and backend/vitest.config.js
- [ ] T005 Add OpenAPI skeleton in backend/src/openapi/openapi.ts and route at GET /openapi.json

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3

Contract tests (REST)

- [ ] T006 [P] Contract test GET /health returns capacity shape in backend/tests/contract/health.contract.test.js
- [ ] T007 [P] Contract test POST /schedule validates request and 202/409/422 in backend/tests/contract/schedule.contract.test.js
- [ ] T008 [P] Contract test GET /pods lists workloads in backend/tests/contract/pods.contract.test.js
- [ ] T009 [P] Contract test POST /evict enforces policy in backend/tests/contract/evict.contract.test.js
- [ ] T010 [P] Contract test POST /task-update updates Spec-Kit/MCP in backend/tests/contract/task_update.contract.test.js
- [ ] T011 [P] Contract test GET /v1/context/search returns ranked items in backend/tests/contract/context.contract.test.js
- [ ] T012 [P] Contract test WS /stream/{id} emits heartbeat/log/result/error in backend/tests/contract/stream.contract.test.js

Integration tests

- [ ] T013 [P] Integration test provider router local-first with cloud fallback in backend/tests/integration/provider_router.integration.test.js
- [ ] T014 [P] Integration test MCP search flow with storage/vector in backend/tests/integration/mcp.integration.test.js
- [ ] T015 [P] Integration test schedule→k8s pod create→logs→evict flow (stubbed k8s) in backend/tests/integration/schedule_k8s.integration.test.js
- [ ] T016 [P] Integration test Tailscale peer negotiation (simulated peers) in backend/tests/integration/peers.integration.test.js

## Phase 3.3: Core Implementation (ONLY after tests are failing)

Routes and controllers

- [ ] T017 Implement GET /health capacity report in backend/src/routes/health.ts
- [ ] T018 Implement POST /schedule with idempotency and policy in backend/src/routes/schedule.ts
- [ ] T019 Implement GET /pods using orchestrator.k8s in backend/src/routes/pods.ts
- [ ] T020 Implement POST /evict with validation and policy in backend/src/routes/evict.ts
- [ ] T021 Implement POST /task-update bridging to Spec-Kit/MCP in backend/src/routes/task_update.ts
- [ ] T022 Implement GET /v1/context/search in backend/src/routes/context.ts
- [ ] T023 Implement WS /stream/{id} with heartbeats/backpressure in backend/src/ws/stream.ts

Middleware and cross-cutting

- [ ] T024 [P] Zod schemas and centralized error handler in backend/src/middleware/errors.ts
- [ ] T025 [P] Auth scopes middleware (read:jobs, write:jobs, llm:invoke, context:read) in backend/src/middleware/auth.ts
- [ ] T026 [P] Rate limiting/quota middleware in backend/src/middleware/rate_limit.ts
- [ ] T027 [P] Correlation IDs and structured JSON logger in backend/src/middleware/logging.ts

Providers and context

- [ ] T028 Provider router (local Ollama, cloud fallback) in backend/src/services/providerRouter.ts
- [ ] T029 Ollama client with health and infer/embeddings in backend/src/clients/ollama.ts
- [ ] T030 Cloud LLM client interface and adapters in backend/src/clients/cloudLLM.ts
- [ ] T031 MCP client (ingest/search/context) in backend/src/clients/mcp.ts

Storage and vector

- [ ] T032 Define repository interfaces (jobs, events, agents, audit) in backend/src/repos/interfaces.ts
- [ ] T033 SQLite implementation for repos in backend/src/repos/sqlite.ts
- [ ] T034 Postgres implementation scaffold in backend/src/repos/postgres.ts
- [ ] T035 Vector adapter interface + in-memory cosine baseline in backend/src/vector/adapter.ts
- [ ] T036 Remote vector adapter scaffold (Weaviate/Milvus) in backend/src/vector/remote.ts

Orchestrator internals

- [ ] T037 Capacity probe and node info in backend/src/orchestrator/capacity.ts
- [ ] T038 Scheduler policy and scoring in backend/src/orchestrator/scheduler.ts
- [ ] T039 Kubernetes control (list/create/delete pods; logs) in backend/src/orchestrator/k8s.ts
- [ ] T040 Tailscale peer discovery and negotiation in backend/src/orchestrator/peers.ts
- [ ] T041 Policy controls and quotas in backend/src/orchestrator/policies.ts

Server wiring

- [ ] T042 Mount new routes/middleware into backend/src/server.ts
- [ ] T043 OpenAPI generation and serve at /openapi.json in backend/src/openapi/openapi.ts

## Phase 3.4: Integration

- [ ] T044 Prometheus metrics endpoint /metrics using prom-client in backend/src/metrics/metrics.ts
- [ ] T045 OTEL tracing hooks with basic spans in backend/src/observability/tracing.ts
- [ ] T046 Secrets management and config loader in backend/src/config/index.ts
- [ ] T047 CORS allow-list and headers hardened in backend/src/middleware/cors.ts
- [ ] T048 Dockerfile updates for new deps; multi-stage caching in backend/Dockerfile
- [ ] T049 Example k3s/microk8s dev script in scripts/k8s_dev_setup.sh
- [ ] T050 Spec‑Kit run endpoint POST /v1/spec-kit/run in backend/src/routes/spec_kit.ts

## Phase 3.5: Polish

- [ ] T051 [P] Unit tests for validation schemas in backend/tests/unit/validation.unit.test.js
- [ ] T052 [P] Unit tests for provider router in backend/tests/unit/provider_router.unit.test.js
- [ ] T053 [P] Performance tests for schedule→pod (<500ms create path mocked) in backend/tests/perf/schedule.perf.test.js
- [ ] T054 [P] Update docs/api.md with endpoints, schemas, and examples in docs/api.md
- [ ] T055 [P] Manual testing checklist in docs/manual-testing.md

## Dependencies

- Tests (T006–T016) must fail before implementing corresponding functionality (T017–T043)
- T037 blocks T017; T038 blocks T018; T039 blocks T019/T020; T040 blocks T018
- T028/T029/T030 block LLM features and related tests
- T032–T036 block MCP/vector integration tests
- Middleware (T024–T027) should precede server wiring (T042)
- Metrics/tracing (T044–T045) can proceed in parallel after routes exist

## Parallel Example

Launch in parallel:

- Contract tests: T006–T012
- Integration tests: T013–T016
- Middleware scaffolds: T024–T027
- Clients/adapters: T028–T036

## Validation Checklist

- [ ] All endpoints have contract tests and implementations
- [ ] Repos and adapters have unit tests
- [ ] WS stream covers heartbeat/backpressure
- [ ] Provider router supports local-first with cloud fallback
- [ ] OpenAPI served and up-to-date
