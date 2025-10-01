# Implementation Plan: Dockerized Decentralized AI Development Platform

This document expands the implementation plan with detailed technical requirements for running the backend in a Docker container, laterally connected to VM/agent containers on a private network, with a locally run web frontend and an Ollama runtime for local inference plus optional cloud fallback.

---

## 1) Scope and assumptions

- Local development: macOS host with Docker Desktop; frontend runs on host (e.g., :3000), backend in container (:8080), Ollama either in a container (private network) or on host (:11434).
- Production/staging: Linux hosts; optional NVIDIA GPUs; KVM available for VM acceleration; private mesh (e.g., Tailscale) optional.
- No Compose or Kubernetes manifests included here; this doc is requirements- and contract-focused only.

---

## 1.1) Architectural principles

- Composability
  - Capabilities are standalone services with clear contracts; assemble them flexibly.
  - Business logic stays in primary services; sidecars only for cross-cutting concerns (metrics/mesh).
  - Components are replaceable: storage, vector store, LLM providers, agents, VM engines.

- Modularity
  - Strict module boundaries; communicate via HTTP/WS/gRPC or narrow SDKs.
  - Public interfaces only; no cross-module hidden dependencies.
  - Feature flags enable/disable modules at runtime where feasible.

- Dependency Injection (DI)
  - External dependencies (DB, vector, LLMs, MCP, logger, metrics) injected via constructors/factories.
  - Providers implement interfaces/ABCs; at least one local and one cloud implementation per concern.
  - Config-driven wiring (env/config) selects implementations at startup.

- Interoperability
  - Prefer open protocols (HTTP/JSON, WebSocket; gRPC optional) and portable auth (scoped tokens).
  - Unified API for multiple LLM/embedding providers with consistent error taxonomy and token accounting.
  - Data portability for context/vector stores; export/import to avoid lock-in.

Derived technical requirements
- Provider router interface + registry (e.g., keys: "ollama", "openai", "anthropic").
- Vector store adapter interface: FAISS (in-proc), Weaviate/Milvus (remote); selectable via config.
- Storage repositories: interface with SQLite/Postgres implementations.
- Agent runner interface supporting local container runners; future remote runners reuse contract.
- VM abstraction with QEMU and KVM/Firecracker backends behind a single API.
- Unified observability API with pluggable exporters (Prometheus, OTEL).

## 2) Milestones and deliverables

- M0 Foundations (Week 1)
  - Private container network established.
  - Backend container exposes :8080 to host; health/readiness endpoints available.
  - Frontend can call backend; CORS configured; WebSocket upgrades verified.

- M1 Context & Storage (Week 2)
  - MCP service reachable on private network; storage selected (SQLite/Postgres) and connected.
  - Basic context ingestion and retrieval flows working.

- M2 Local inference (Week 3)
  - Ollama reachable by backend/agents; models pre-pulled and pinned.
  - Provider routing (local-first, cloud-fallback) implemented with per-request override.

- M3 Agents & VMs (Week 4)
  - One agent container integrated and producing output via WS to frontend.
  - One VM container integrated (QEMU on macOS, KVM on Linux); ephemeral lifecycle and job handoff verified.

- M4 Observability & Security (Week 5)
  - Logs, metrics, optional traces wired; dashboards with key SLOs.
  - Basic authZ/N; rate limits; secrets management; non-root, least caps.

- M5 Production hardening (Week 6)
  - Reverse proxy with TLS; persistence volumes; GPU enablement (if applicable).
  - Runbooks and acceptance criteria validated via E2E tests.

---

## 3) Environment and configuration

- Environment variables (examples; exact names may vary)
  - Backend/API: API_PORT, LOG_LEVEL, CORS_ALLOWED_ORIGINS, PROVIDER_POLICY (e.g., "local,cloud"), REQUEST_TIMEOUT_MS, WS_PING_INTERVAL_MS.
  - Service URLs: MCP_URL, STORAGE_URL, VECTOR_DB_URL, OLLAMA_BASE_URL, CLOUD_PROVIDER_BASE_URL.
  - Secrets: CLOUD_API_KEYS (OpenAI/Anthropic/etc.), DB credentials; inject via env or Docker secrets.
  - Frontend: API_BASE_URL (http://localhost:8080), feature flags (localLLMPreferred, enableCloudFallback).
  - Networking: PRIVATE_NETWORK_NAME (e.g., dev-mesh), SERVICE_NAMES (mcp, storage, ollama).

- Ports (conventions)
  - Backend :8080 (host-published)
  - MCP :7000 (private)
  - Storage (Postgres) :5432 (private)
  - Vector DB :8080 (private, if external)
  - Ollama :11434 (private or host)
  - Frontend :3000 (host)

---

## 4) Component requirements

### 4.1 Backend API

- Functional
  - Accept jobs/commands; return job IDs; stream logs/status via WebSocket.
  - Access MCP for context retrieval and updates.
  - Route LLM calls using provider policy: local (Ollama) primary with cloud fallback.
  - Manage agent/VM orchestration signals (dispatch, cancel, heartbeat).

- Non-functional
  - Availability: single-instance acceptable for dev; plan horizontal scale later.
  - P99 latency targets per endpoint; explicit timeouts and circuit breakers for provider calls.
  - Idempotency for job submission (client retry safe via idempotency key).

- Configuration
  - Env-driven configuration; hot-reload for non-critical toggles (e.g., log level, provider policy) if possible.
  - CORS allow-list for http://localhost:3000 in dev; no wildcard in prod.

- Interface contracts (high level)
  - POST /v1/jobs: create job; returns {jobId}.
  - GET /v1/jobs/{id}: status and summary.
  - WS /v1/stream/{id}: server-to-client messages: {type, ts, payload} (types: log, status, result, error, heartbeat).
  - GET /v1/context/search?q=...: returns ranked items; includes source, score, snippet.
  - POST /v1/llm/infer: {model, input, params, policyOverride?}; returns streamed tokens or final text.

- Error taxonomy
  - 4xx: validation, auth, policy (rate limit/quota exceeded).
  - 5xx: upstream provider errors; include provider and correlation ID.

- AuthZ (phase-1 minimal)
  - Token-based; scopes: read:jobs, write:jobs, llm:invoke, context:read.
  - Optional dev bypass behind localhost.

### 4.2 MCP (Memory & Context Plane)

- Responsibilities
  - Index notes/docs and code metadata; expose semantic search and retrieval APIs.
  - Provide context packs for agents/jobs with size/token budgets.

- APIs (high level)
  - POST /v1/ingest: push/update content with metadata.
  - GET /v1/search: semantic + keyword fused search (query, filters, topK).
  - GET /v1/context/{jobId}: curated context set for a job.

- Embeddings
  - Local via Ollama-compatible embeddings model preferred when privacy required.
  - Cloud fallback when quality/perf is insufficient; log provider choice.

- Storage
  - Metadata in SQL; vectors in in-process FAISS or external vector DB; versioned indices.

### 4.3 Storage (SQL)

- Minimal schema areas
  - jobs (id, type, status, timestamps, owner)
  - events/logs (jobId, ts, level, message, payload)
  - agents (id, capabilities, status, lastSeen)
  - audit (actor, action, resource, ts)

- Operational
  - Connection pooling; backoff retries; migrations versioned; backups for prod.

### 4.4 Vector store

- Requirements
  - Collections per domain (notes, code, runs).
  - Dimension must match embedding model; document chosen dimension and model mapping.
  - Reindexing strategy; cold rebuild and incremental updates supported.

### 4.5 Ollama runtime

- Requirements
  - Reachable on private network or via host at :11434.
  - Models pre-pulled and version-pinned; models cache persisted.
  - Health endpoint checked at startup; warm-up prompt optional.

- Model registry (examples)
  - Chat/general: llama3 (e.g., 8B), mistral 7B equivalent.
  - Coding: codellama 7B/13B, qwen2.5-coder family.
  - Embeddings: nomic-embed or all-mpnet-like Ollama variants.

- GPU (Linux)
  - NVIDIA toolkit; verify driver/compute compatibility; limit GPU via device flags.

### 4.6 Agent containers

- Requirements
  - Non-root user; read-only root FS where possible; writable work dir for temp.
  - Config: BACKEND_URL, MCP_URL, OLLAMA_BASE_URL; feature flags for tools.
  - Capabilities: file ops (bounded), tool execution (allow-listed), network egress restrictions.
  - Concurrency: worker pool size; per-task CPU/mem limits; task timeouts and cancellation.
  - Telemetry: emit structured logs/metrics (task time, tokens, provider choice, errors).

### 4.7 VM containers

- macOS dev
  - QEMU-based; no KVM accel; small base images; ephemeral; lifecycle per job.

- Linux prod
  - KVM-enabled; privileged with /dev/kvm device; consider Firecracker microVMs.

- Control
  - API/handshake with backend: request VM, pass artifacts, execute workload, return outputs, teardown.
  - Resource caps; max runtime; disk quotas; network policy.

### 4.8 Frontend

- Requirements
  - Talks to http://localhost:8080; maintains WS connection with heartbeat/reconnect.
  - Displays job status/logs; exposes provider override (local/cloud) per request.
  - Handles offline/unavailable backend gracefully with user prompts/backoff.

### 4.9 Networking

- One private network for all containers; service discovery by DNS name.
- Only backend published to host; all other services private.
- Optionally run Ollama on host and reference host.docker.internal:11434 from containers (macOS convenience).
- Optional Tailscale for cross-host access; restrict via ACLs.

---

## 5) Security requirements

- Process and container hardening: non-root, least caps, read-only FS where possible.
- Secrets management: env or Docker secrets; never commit secrets.
- Input validation and output encoding; guard rails on agent tool execution (allow-list, path jail, network egress rules).
- Rate limiting and quotas per token and per provider; cost guardrails for cloud providers.
- Network policy: Ollama and storage not exposed publicly; backend only on localhost in dev.
- Audit: record actor, action, resource, outcome; include correlation IDs.

---

## 6) Observability requirements

- Logs: JSON with fields (ts, level, service, requestId, jobId, actor, provider, model, tokens, latencyMs, outcome).
- Metrics: HTTP/server (req count, latency, errors), LLM (tokens in/out, latency, provider selection, fallback count), jobs (queued/running/succeeded/failed), agents (alive, task time), VMs (provision time, runtime, failures).
- Tracing: OTEL spans across frontend->backend->MCP->LLM provider; include model and provider attributes.

---

## 7) Testing and validation

- Unit tests: backend handlers, provider router, MCP indexing/search logic.
- Integration tests: spin services, submit jobs, validate WS streams, verify context assembly and LLM outputs.
- Load tests: LLM throughput/latency under concurrent jobs; provider fallback behavior.
- Chaos/failure injection: kill agent/VM containers; simulate provider outages and ensure fallback.
- Security tests: authZ checks, rate limit enforcement, tool sandbox bypass attempts.

---

## 8) Operational runbooks

- Startup sequence: storage -> MCP -> Ollama -> backend -> agents -> VMs -> frontend.
- Model preloading: list of model tags; verification and warm-up prompts.
- Backup/restore (prod): DB backups; model cache restore from artifact store.
- Incident response: degraded provider, fallback thresholds, circuit breakers.
- Scaling guidance: backend horizontal scale, agent pool sizing, VM fleet capacity.

---

## 9) Production hardening

- Reverse proxy with TLS, HSTS, rate limits, request size limits.
- Persistent volumes for DB and model cache; image pinning and SBOM tracking.
- GPU enablement on Linux; version pinning for drivers/toolkit.
- Access control: IP allow-lists, Tailscale ACLs; rotate keys; audit reviews.

---

## 10) Acceptance criteria (go/no-go)

- Backend reachable at http://localhost:8080; CORS and WS OK.
- MCP search returns relevant results; context packs produced within size limits.
- Ollama reachable; required models present; fallback to cloud works and is observable.
- Agent completes a sample coding task; logs stream to frontend; telemetry captured.
- VM job lifecycle validated (provision -> execute -> teardown) on macOS (QEMU) and Linux (KVM).
- Security checks pass: non-root containers, secrets not exposed, ports restricted.
- Observability dashboard shows key metrics and alerts.
 - Swappability: change vector store (FAISS -> Weaviate) and LLM provider (Ollama -> cloud) via config only; no code changes.
 - DI fidelity: unit tests pass with in-memory fakes; prod runs with real providers using same interfaces.
 - Interop: context data export/import succeeds; provider errors map to shared taxonomy.

---

## 11) Non-goals (phase-1)

- Multi-tenant RBAC beyond basic scopes.
- Full autoscaling policies; advanced scheduling.
- Cross-region replication and failover.
