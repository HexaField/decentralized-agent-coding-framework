# Project Backlog (Dot-Point)

This backlog breaks the project into actionable items across all workstreams. Keep entries small, testable, and independent where possible.

---

## 0) Foundations
- Repo housekeeping: LICENSE, CODE_OF_CONDUCT, CONTRIBUTING, PR templates.
- CI bootstrap: lint/type check (Node), build orchestrator image, basic test runner.
- Dev env docs: .env.example, local run matrix (macOS/Linux), port map.

## 1) Orchestrator backend (API/WS)
- Define OpenAPI outline for core endpoints (/health, /ready, /jobs, /stream, /context).
- Implement request validation and centralized error handling.
- Job lifecycle: create, status, cancel, idempotency token.
- WebSocket: connection auth, heartbeats, backpressure handling.
- Provider router interface; config-driven selection; per-request overrides.
- Rate limiting/quota middleware (token-based).
- Correlation IDs and structured logging.

## 2) MCP (Memory & Context Plane)
- API contracts: ingest, search, context assembly.
- Ingestion pipeline: dedupe, metadata extraction, versioning.
- Embeddings: local-first via Ollama; cloud fallback; provider metrics.
- Retrieval: hybrid search (semantic + keyword), filters, topK.
- Context packing: token budgeting, dedup, source attribution.

## 3) Storage
- Schema migrations: jobs, events/logs, agents, audit.
- Repository interfaces; SQLite and Postgres implementations.
- Connection pooling and retry/backoff.
- Backup/restore procedure (prod note).

## 4) Vector store
- Adapter interface; FAISS in-proc implementation.
- Remote adapter (Weaviate or Milvus) implementation.
- Dimension/model mapping and reindex strategy.
- Benchmarks: recall/latency on sample corpus.

## 5) Ollama integration
- Health checks and warm-up routine.
- Model registry and pinning; cache persistence.
- Embedding and completion endpoints; error taxonomy mapping.
- Local-first, cloud-fallback routing with circuit breakers.

## 6) Agents
- Agent runner interface; containerized local runner implementation.
- Tooling policy: allow-list, path sandbox, network egress rules.
- Concurrency model: worker pool sizing, queueing, cancellation.
- Telemetry: task duration, tokens, provider usage, errors.

## 7) VM execution
- VM abstraction: QEMU (macOS dev), KVM/Firecracker (Linux prod).
- Provision/teardown API; artifact handoff; logs/metrics capture.
- Resource limits: CPU/mem/disk/time; failure handling.
- Smoke tests across macOS (QEMU) and Linux (KVM).

## 8) Frontend (local UI)
- API client with retries, auth, and WS reconnect.
- Jobs UI: submit, monitor, logs, results.
- Provider controls: local/cloud override per request.
- Error/empty/loading states; accessibility pass.

## 9) Security
- Non-root containers, least caps, read-only FS where feasible.
- Secrets handling: env vars or Docker secrets; never in repo.
- AuthZ scopes and tokens; dev bypass limited to localhost.
- Rate limits/quotas; cost guardrails for cloud providers.
- Network policy: only backend published; Ollama/storage private.
- Audit logging: actor, action, resource, outcome.

## 10) Observability
- Logging fields: ts, level, service, requestId, jobId, provider, model, tokens, latencyMs, outcome.
- Metrics: server, LLM, jobs, agents, VMs; dashboards.
- Tracing: OTEL spans across frontend->backend->MCP->LLM.
- Alerts: provider outage, high error rate, queue backlog.

## 11) Testing
- Unit tests: routers, repos, adapters, packing logic.
- Integration: end-to-end job flow, context retrieval, streaming.
- Load tests: concurrent jobs; latency budgets; fallback frequency.
- Chaos tests: provider outage; agent crash; VM failure.

## 12) Release & packaging
- Docker image hardening: user, labels, SBOM, pinned base.
- Versioning/tagging strategy for images.
- Release notes template and cadence.
- Optional: publish to GHCR.

## 13) Production hardening
- Reverse proxy (TLS, HSTS, rate limits).
- Persistent volumes (DB, model cache); backup policy.
- GPU enablement (Linux) and driver pinning.
- SLOs and circuit breaker thresholds documented.

## 14) Interoperability & DI
- Provider registry with plug-in discovery.
- Vector and storage adapters behind interfaces.
- In-memory fakes for tests; prod bindings via config.
- Import/export for context and vectors (portability).

## 15) Docs & examples
- Architecture overview and ADRs for key decisions.
- Implementation plan and checklists linked from README.
- Example flows: local-only vs cloud-fallback.
- Troubleshooting guide (ports, permissions, KVM, GPU).

## 16) Nice-to-haves (later)
- Autoscaling agents/VMs; queue depth based scaling.
- Multi-tenant RBAC; project/workspace isolation.
- Cross-region replication; failover drills.
- Plugin marketplace for tools/providers.
