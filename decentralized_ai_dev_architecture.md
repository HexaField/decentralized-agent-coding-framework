# Decentralized AI-Enhanced Development Architecture (Dockerized)

This document updates the plan to run the whole backend inside a Docker container, connect it laterally to other Docker containers that host the VM runtimes/agents, and use a locally run web front end on the host to talk to the backend container. Kubernetes remains an optional future migration; this plan is Compose-first for fast local and edge deployments.

---

## 1) Overview

Goal: a secure, composable, AI-augmented dev environment where the backend API runs in one container, discovers and coordinates “VM containers” and agent containers on the same Docker network, while a local web UI (running on the host) connects to the backend via localhost.

Key properties
- Backend packaged as a single container exposing a stable API/WebSocket port.
- Lateral communication to other containers via a private Docker network (service discovery by DNS).
- Local web UI (Next.js/Vite/etc.) runs on the host, configured to call http://localhost:<api_port>.
- Optional tailscale sidecar for private mesh connectivity across hosts.
- Local inference via an Ollama runtime colocated with the backend; optional cloud LLM/embedding providers for fallback or augmentation.

---

## 2) High-level topology

```
┌──────────────────────────────────────────────────────────────────────┐
│ Host (macOS)                                                         │
│                                                                      │
│  Local Web UI (localhost:3000)                                       │
│          │ HTTP(S)/WS                                                │
│          ▼                                                           │
│  Backend API (container, :8080) ──────┬───────── Docker network ─────────────┐
│                                       │                                      │
│                                Agent containers                        VM containers
│                                (ai-agent-*)                             (vm-*)
│                                       │                                      │
│                                Vector DB / SQL DB                   Radicle peer / code-server
│                                (weaviate/postgres/sqlite)           (optional containers)
│                                       │
│                                Ollama (local LLM runtime, :11434)
│                                                                      │
│                                                [optional] Tailscale sidecar container
└──────────────────────────────────────────────────────────────────────┘
```

Notes
- On macOS, true hardware virtualization (KVM) isn’t available to Docker containers. For “VM containers,” use QEMU-based images (slower) for local testing, or run on a Linux host with /dev/kvm for performance.
- The backend only exposes a single public port to the host; all other services are internal to the Docker network.

---

## 3) Services/containers

Required
- backend-api: FastAPI/Node service. Single external port (e.g., 8080). Handles auth, job routing, WebSockets.
- mcp: Memory & Context Plane service exposing context to agents and the backend (can be embedded into backend if simpler early on).
- storage: SQLite (simplest) or Postgres container. Volume-backed.
- vector-db: FAISS in-process or external Weaviate/Milvus/Pinecone. For local, prefer in-process FAISS or SQLite-vec to minimize moving parts.
- ollama: Local LLM runtime for inference and embeddings (default port 11434). Recommended for local/offline operation; can be disabled if only cloud providers are used.

Optional/Pluggable
- ai-agent-N: Agent runtimes (language model clients, tool runners) in isolated containers.
- vm-N: “VM containers” running QEMU or Firecracker-based microVMs. Linux host with /dev/kvm recommended for performance; otherwise QEMU without accel on macOS for dev.
- radicle-node: Decentralized code collaboration peer.
- code-server: Browser-accessible VS Code in a container (for remote edits without running a local IDE).
- tailscale: Userspace tailscale container to join a tailnet for private connectivity.

Front end
- Runs locally on the host (e.g., Next.js/Vite dev server on port 3000). Configure API base URL to http://localhost:8080. Enable CORS on backend for http://localhost:3000.

---

## 4) Networking model

- One private Docker network (e.g., dev-mesh). All containers join it.
- backend-api publishes port 8080 to host. Frontend calls http://localhost:8080.
- Service discovery via Docker DNS: containers reachable by service name (e.g., http://mcp:7000).
- CORS: backend allows the local frontend origin (http://localhost:3000).
- WebSockets: ensure backend upgrades are enabled on the published 8080 port.
- Ollama: reachable on the private network at http://ollama:11434 by backend and agents. On macOS, you may prefer running Ollama on the host and referencing http://host.docker.internal:11434 from containers.

---

## 5) Orchestration guidance (no compose example)

Principles
- Keep a single externally exposed backend port (e.g., 8080) mapped to localhost; all other services remain on a private container network.
- Use a named private network for service discovery; address peers by service name (e.g., mcp:7000, storage:5432).
- Parameterize secrets and config with environment variables or Docker secrets; never bake secrets into images.
- For macOS, prefer lightweight “VM containers” via QEMU for dev only; for production or heavy workloads, deploy to Linux with /dev/kvm.
- Ollama models are pulled on demand; persist a models cache directory via a volume for faster startups. Consider pinning model versions/tags for reproducibility.

Minimum set to operate
- Backend API container with CORS enabled for http://localhost:3000 and WS upgrades.
- Context service (MCP) and a storage backend (SQLite/Postgres) reachable on the private network.
- Optional vector store, agents, VM containers as needed by the workload.
- Ollama runtime available either as a container on the private network or via the host at port 11434.

Operational notes
- Frontend runs locally and points to http://localhost:8080.
- Add/remove agent/VM containers without changing the frontend; the backend discovers peers on the network.
- Put a reverse proxy (Caddy/Traefik) in front of the backend for TLS/rate limits when exposing beyond localhost.
- Configure backend/agents with an OLLAMA_BASE_URL and provider routing policy; support dynamic enable/disable of local vs cloud providers per request.

Notes
- For simple local setups, you can swap Postgres/Weaviate for in-process SQLite/FAISS inside backend-api and MCP to reduce services.
- Add more ai-agent-* or vm-* services as needed; backend-api addresses them by service name on the private network.

---

## 6) Ollama integration and model routing (local + cloud)

Routing strategy
- Primary: use Ollama for low-latency, private local inference when models are available.
- Fallback: if a requested model is unavailable or exceeds latency/quality thresholds, route to cloud (OpenAI/Anthropic/etc.).
- Per-request overrides: allow callers to force local-only or cloud-only via a flag.

Configuration
- Endpoints: OLLAMA_BASE_URL (e.g., http://ollama:11434 or http://host.docker.internal:11434), CLOUD_PROVIDER_BASE_URL/API keys.
- Policies: provider priority list (e.g., [local, cloud]), timeout/latency budgets, max tokens, temperature.
- Model registry/mapping: logical model names (e.g., code-large) map to concrete Ollama or cloud model IDs.

Operational notes
- Warm-up: pre-pull and warm frequently-used models at startup to avoid initial latency spikes.
- Embeddings: prefer local embeddings via Ollama compatible models when privacy is paramount; fall back to cloud when quality/perf required.
- Telemetry: log selected provider, model ID, latency, token counts, and fallback events.

macOS vs Linux
- macOS: running Ollama inside a container may not leverage GPU acceleration; consider running Ollama on the host and pointing containers to host.docker.internal.
- Linux: for NVIDIA GPUs, use a GPU-enabled Ollama runtime and grant access to GPU devices; pin CUDA/driver versions for stability.

---

## 7) Backend–Frontend contract

Inputs/outputs
- Frontend calls backend-api at http://localhost:8080 (REST + WebSockets).
- Backend emits server-sent events or WS for job status, logs, and agent output.

Edge cases
- Backend unavailable: frontend shows retry/connectivity state.
- CORS mismatch: ensure backend CORS allows the frontend origin.
- Long-running jobs: use WS heartbeats and timeouts; surface job IDs for resumption.

---

## 8) Security

- Run containers as non-root; drop capabilities except where unavoidable (e.g., /dev/kvm requires elevated privileges on Linux).
- Keep a single published port (backend-api). Everything else stays on the private network.
- Configure authN/Z on backend routes; sign agent actions; audit logs via stdout + optional OTEL exporter.
- If using tailscale, restrict access via ACLs; avoid exposing the backend on 0.0.0.0 beyond local development.
- Restrict Ollama to the private network or localhost only; avoid exposing :11434 publicly. Consider request quotas and allow-listing call sites.

---

## 9) Observability

- Logging: structured JSON logs from each service.
- Metrics: Prometheus endpoint from backend-api and mcp; optional cAdvisor for container metrics. Export provider selection, tokens, and costs (if cloud) as metrics.
- Tracing: OTEL SDK with local collector container (optional) for end-to-end spans.

---

## 10) Local development flow

1) Start containers (backend-api, storage, vector-db, mcp, ollama, agents, vm-* as needed).
2) Start the frontend locally on the host (e.g., Next.js on :3000) with API base URL set to http://localhost:8080.
3) Develop backend changes with live reload (bind-mount source and use nodemon/uvicorn reload if desired).
4) Ensure Ollama is reachable and models are pulled/warmed; then test agent and VM job execution; verify logs flow over WS to the frontend.

Configuration tips
- .env for compose: API_PORT, DB creds, model/provider keys via env vars (never commit secrets).
- CORS: enumerate http://localhost:3000; avoid wildcard in production.

---

## 11) Production and Linux KVM notes

- For performant “VM containers,” deploy on a Linux host with KVM:
       - privileged: true and devices: [/dev/kvm] in compose.
       - Consider Firecracker (via ignite) or QEMU with virtio; ensure images are small and immutable.
- Frontend can be static-hosted (CDN) or containerized; still points to the backend’s public URL.
- Put a reverse proxy (Traefik/Caddy) in front of backend-api for TLS and rate limits.

Ollama production notes
- CPU-only works but may be slower; for GPU acceleration on Linux, use NVIDIA Container Toolkit and pin compatible drivers.
- Persist the Ollama models cache on fast storage; pre-pull specific model tags; maintain a bill-of-materials for deterministic deployments.
- Consider model SLOs (latency/quality); define clear fallback-to-cloud thresholds and circuit breakers.

---

## 12) Optional: code-server and Radicle

- code-server container for browser editing; join dev-mesh and talk to backend-api/mcp as needed.
- radicle-node container for decentralized PR-like workflows; persist identity with a volume.

---

## 13) Migration appendix: from Compose to Kubernetes (future)

- Map services to Deployments; dev-mesh -> Kubernetes NetworkPolicy + a single Ingress for backend-api.
- Use StatefulSets for storage/vector DB; Secrets for creds; ServiceAccounts + RBAC.
- tailscale operator for cluster egress if needed.

---

## 14) Quick checklist

- [ ] Backend container exposes 8080 and enables CORS for http://localhost:3000.
- [ ] Frontend points to http://localhost:8080 and handles WS reconnect.
- [ ] Compose network created; services discoverable by name.
- [ ] Optional VM containers run (QEMU on macOS; KVM on Linux) and reachable by backend.
- [ ] Secrets injected via env vars or Docker secrets; no secrets in images.
- [ ] Ollama reachable by backend/agents (container or host), with required models pulled and version-pinned.
- [ ] Provider routing policy set (local-first, cloud-fallback) with timeouts and telemetry.

---

This Compose-first architecture runs the backend entirely in a Docker container, connects it laterally to agent/VM containers on an internal network, and uses a locally run web UI to interact with it. Kubernetes can be adopted later with minimal conceptual changes.

See also: IMPLEMENTATION_PLAN.md for a detailed, step-by-step implementation plan and technical requirements.

---

## 15) Simple implementation plan

- Prep
       - Create a .env with API_PORT, DB credentials, OLLAMA_BASE_URL, and any cloud LLM keys.
       - Decide storage mode: SQLite (in-process) or Postgres container; decide on vector store (in-process vs external).
- Backend container
       - Containerize backend; expose 8080; enable CORS for http://localhost:3000 and WebSocket upgrades.
       - Add config for MCP URL, storage URL, vector store URL, and provider routing (local-first, cloud-fallback).
- Private networking
       - Place backend, MCP, storage, agents, VM runners, and Ollama on a single private container network.
       - Keep only backend port published to host; all other services internal.
- MCP and storage
       - Stand up MCP; connect it to storage (SQLite/Postgres). Verify health/readiness endpoints.
- Ollama
       - Run Ollama (container on the private network or host at :11434). Set OLLAMA_BASE_URL for backend and agents.
       - Pre-pull and pin required model tags; persist the models cache.
- Agents and VM containers
       - Launch one ai-agent container; verify it can reach backend, MCP, and Ollama.
       - Add a VM runner container; on macOS use QEMU (no KVM); on Linux grant /dev/kvm for acceleration.
- Frontend
       - Run locally on :3000; point API base to http://localhost:8080; implement WS reconnect/backoff.
- Security
       - Run as non-root; restrict capabilities; do not expose :11434 publicly; inject secrets via env or Docker secrets.
- Observability
       - Emit structured logs; expose metrics (requests, latency, tokens, provider selection); optional OTEL tracing.
- Local E2E
       - Start services; warm models; run a sample job; confirm logs/metrics and provider routing (local then cloud fallback on demand).
- Production hardening
       - Add reverse proxy with TLS and rate limits; persist volumes (DB, models); define SLOs and fallback thresholds; enable GPU for Ollama on Linux.
- Optional integrations
       - Add code-server and Radicle containers; join private network; add Tailscale if cross-host access is needed.
- Migration readiness
       - Document env and ports; map services to k8s manifests for a future cluster deployment.

