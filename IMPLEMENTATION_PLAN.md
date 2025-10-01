# Implementation Plan: Decentralized AI‑Augmented Development Platform

This plan describes a single architecture: per‑machine orchestrators peered over Tailscale, scheduling workloads onto local Kubernetes nodes/pods, with MCP for context, Spec‑Kit for task tracking, Radicle for decentralized collaboration, and an Obsidian vault for knowledge. A “Local Dev” appendix documents running the same architecture locally with a Dockerized backend and host UI.

---

## 1) Scope and assumptions

- Local development: macOS host with Docker; frontend on host (:3000), backend container (:8080); Ollama as container or host (:11434). Agents/VMs as sibling containers.
- Production: Linux hosts with k3s/microk8s or kubelet; NVIDIA GPUs optional; KVM available; Tailscale mesh connects machines.
- This doc focuses on requirements and contracts; manifests provided later.

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

- M0 Foundations
  - Dockerized backend on :8080; host UI on :3000; CORS/WS verified.
  - MCP, storage, vector, and Ollama reachable (local network/host).

- M1 Local orchestrator
  - Orchestrator reports node capacity; exposes /health, /pods; launches pods via k3s/microk8s.
  - Basic scheduling within the local node; log streaming.

- M2 Peer discovery & negotiation
  - Tailscale discovery using device hostnames; capacity exchange and scoring.
  - /schedule API selects local or remote node; forwards and tracks jobs.

- M3 Kubernetes integration
  - Remote placement via k8s APIs or Virtual Kubelet pattern.
  - Ephemeral pods for code-server, agents, VMs; artifact handoff.

- M4 Spec‑Kit & MCP integration
  - Orchestrator updates Spec‑Kit tasks; MCP ingest/search contexts available to agents/jobs.

- M5 Security & governance
  - ACLs, signed manifests, quotas, audit logs; reverse proxy, TLS, and rate limits.

---

## 3) Environment and configuration

- Environment variables (examples; exact names may vary)
  - Backend/API: API_PORT, LOG_LEVEL, CORS_ALLOWED_ORIGINS, PROVIDER_POLICY (e.g., "local,cloud"), REQUEST_TIMEOUT_MS, WS_PING_INTERVAL_MS.
  - Service URLs: MCP_URL, STORAGE_URL, VECTOR_DB_URL, OLLAMA_BASE_URL, CLOUD_PROVIDER_BASE_URL.
  - Secrets: CLOUD_API_KEYS (OpenAI/Anthropic/etc.), DB credentials; inject via env or Docker secrets.
  - Frontend: API_BASE_URL (http://localhost:8080), feature flags (localLLMPreferred, enableCloudFallback).
  - Networking: PRIVATE_NETWORK_NAME (for local Docker dev), SERVICE_NAMES (mcp, storage, ollama), plus Tailscale device name, tailnet, ACL profile, and K8s API URL/context.
  - Spec Kit: SPEC_KIT_ENABLED=true|false, SPEC_KIT_AI=copilot|claude|..., SPECIFY_FEATURE, SPEC_KIT_WORKDIR=/workspace/specs, SPEC_KIT_BIN (optional path; defaults to persistent `specify`).

- Ports (conventions)
  - Backend :8080 (host-published)
  - MCP :7000 (private)
  - Storage (Postgres) :5432 (private)
  - Vector DB :8080 (private, if external)
  - Ollama :11434 (private or host)
  - Frontend :3000 (host)

---

## 4) Component requirements

### 4.1 Orchestrator API

- Functional
  - Report capacity (/health); list managed workloads (/pods); schedule requests (/schedule); evict (/evict); task updates (/task-update).
  - Access MCP for context retrieval and updates.
  - Route LLM calls using provider policy: local (Ollama) primary with cloud fallback.
  - Manage agent/VM orchestration signals and WS log streaming.

- Non-functional
  - Availability: single-instance acceptable for dev; plan horizontal scale later.
  - P99 latency targets per endpoint; explicit timeouts and circuit breakers for provider calls.
  - Idempotency for job submission (client retry safe via idempotency key).

- Configuration
  - Env-driven configuration; hot-reload for non-critical toggles (e.g., log level, provider policy) if possible.
  - CORS allow-list for http://localhost:3000 in dev; no wildcard in prod.

- Interface contracts (high level)
  - GET /health, GET /pods, POST /schedule, POST /evict, POST /task-update
  - WS /stream/{id}: {type, ts, payload} (log, status, result, error, heartbeat)
  - GET /context/search?q=..., POST /llm/infer

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

### 4.6 Agent workloads

- Requirements
  - Non-root user; read-only root FS where possible; writable work dir for temp.
  - Config: BACKEND_URL, MCP_URL, OLLAMA_BASE_URL; feature flags for tools.
  - Capabilities: file ops (bounded), tool execution (allow-listed), network egress restrictions.
  - Concurrency: worker pool size; per-task CPU/mem limits; task timeouts and cancellation.
  - Telemetry: emit structured logs/metrics (task time, tokens, provider choice, errors).
  - Spec Kit usage: when SPEC_KIT_ENABLED, agents can request orchestrator to run Spec Kit flows (/constitution, /specify, /clarify, /plan, /tasks, /implement). Outputs stored in SPEC_KIT_WORKDIR and/or committed under a feature branch when configured.

### 4.7 VM workloads

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

### 4.10 Spec Kit toolchain (inside orchestrator)

- Responsibilities
  - Provide a controlled interface to Spec Kit (Specify CLI) to support agentic coder workflows.
  - Map high-level actions to CLI invocations (e.g., "run /plan" → specify /plan flow) with safe defaults.
  - Persist generated artifacts to SPEC_KIT_WORKDIR (e.g., `specs/`) and synchronize with docs (`IMPLEMENTATION_PLAN.md`, `BACKLOG.md`, `README.md`) when applicable.

- Invocation model
  - Prefer persistent install: `uv tool install specify-cli --from git+https://github.com/github/spec-kit.git`; then use `specify <command>`.
  - Support one-time `uvx` fallback; discover via SPEC_KIT_BIN if set.
  - Dry-run modes where supported; require a feature branch for mutating operations by default.

- Contracts
  - Orchestrator API exposes endpoints for Spec Kit operations, e.g., POST /v1/spec-kit/run { command, args, dryRun?, feature? }.
  - Events streamed over WS with logs, prompts, and results; artifacts paths reported.
  - Rate limits and concurrency controls to avoid overlapping mutating runs.

- Storage and SCM
  - Write outputs under SPEC_KIT_WORKDIR; avoid modifying unrelated files.
  - Optional git integration: create feature branches, commit artifacts, and open PRs (future).

- Observability
  - Metrics: spec_kit_runs_total, spec_kit_failures_total, spec_kit_duration_ms, by command.
  - Logs: provider/AI used, command, args, artifact paths, dry-run vs live.

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
 - Spec Kit tests: mock SPEC_KIT_BIN to a no-op script; validate orchestrator endpoints (/v1/spec-kit/run) and artifact emission under SPEC_KIT_WORKDIR; concurrency and rate limit behavior.

---

## 8) Operational runbooks

- Startup sequence (local): storage -> MCP -> Ollama -> backend -> agents -> VMs -> frontend.
- Startup sequence (clustered): k8s node ready -> MCP/storage/vector -> orchestrator -> agents/VMs -> frontend.
- Model preloading: list of model tags; verification and warm-up prompts.
- Backup/restore (prod): DB backups; model cache restore from artifact store.
- Incident response: degraded provider, fallback thresholds, circuit breakers.
- Scaling guidance: backend horizontal scale, agent pool sizing, VM fleet capacity.
 - Spec Kit operations: enable/disable via SPEC_KIT_ENABLED; rotate AI/tool tokens; safe-init procedures (feature branch); cleanup artifacts and rollback.

---

## 9) Production hardening

- Reverse proxy with TLS, HSTS, rate limits, request size limits.
- Persistent volumes for DB and model cache; image pinning and SBOM tracking.
- GPU enablement on Linux; version pinning for drivers/toolkit.
- Access control: IP allow-lists, Tailscale ACLs; rotate keys; audit reviews.
 - Spec Kit execution sandbox: strict allow-list on commands, working directory jail, redaction of secrets from logs, resource/time limits for CLI runs.

---

## 10) Acceptance criteria (go/no-go)

- Backend reachable at http://localhost:8080; CORS and WS OK.
- MCP search returns relevant results; context packs produced within size limits.
- Ollama reachable; required models present; fallback to cloud works and is observable.
- Agent completes a sample coding task; logs stream to frontend; telemetry captured.
- VM job lifecycle validated (provision -> execute -> teardown) on macOS (QEMU) and Linux (KVM).
- Tailscale peer discovery operational; cross-node scheduling demonstrated.
- k3s/microk8s placement verified; logs/results streamed to requester.
- Security checks pass: non-root containers, secrets not exposed, ports restricted.
- Observability dashboard shows key metrics and alerts.
 - Swappability: change vector store (FAISS -> Weaviate) and LLM provider (Ollama -> cloud) via config only; no code changes.
 - DI fidelity: unit tests pass with in-memory fakes; prod runs with real providers using same interfaces.
 - Interop: context data export/import succeeds; provider errors map to shared taxonomy.
 - Spec Kit: orchestrator can run a dry-run /plan and /tasks producing artifacts in SPEC_KIT_WORKDIR, with metrics and logs recorded; mutating runs require a feature branch or explicit override.

---

## 11) Non-goals (phase-1)
---

## Appendix: Local Dev (Docker)

See README for local run steps. This mode uses a Dockerized backend and sibling containers for MCP/storage/vector/Ollama/agents/VMs on a private Docker network. It aligns with the per-machine orchestrator model and runs fully locally.
- Multi-tenant RBAC beyond basic scopes.
- Full autoscaling policies; advanced scheduling.
- Cross-region replication and failover.
