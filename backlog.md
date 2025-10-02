# Project Backlog and Status

A living, end-to-end backlog tracking what’s built, what’s verified, and what’s next for the distributed AI-augmented dev lab MVP.

Current quick links:
- Orchestrator: http://127.0.0.1:18080/health (bound on 0.0.0.0 for k3d pods)
- Dashboard: http://127.0.0.1:8090/ui (API: /api/health)
- Agent (local port-forward): http://127.0.0.1:8443/

Repo layout of interest:
- Orchestrator: `src/orchestrator/app`, Dockerfile: `src/docker/orchestrator.Dockerfile`
- Dashboard: `src/dashboard/server`, UI: `src/dashboard/ui`, package.json: `src/dashboard/package.json`
- Agent: `src/agent/app` (Go app + code-server fallback), Dockerfile: `src/docker/agent.Dockerfile`
- Compose (local services): `src/compose/docker-compose.orchestrator.yml`
- Kubernetes base: `src/k8s/base`
- Scripts: `src/scripts/*.sh`

---

## Phase 0 — Planning & Docs
- [x] Choose Talos for K8s management (future) and Headscale for Tailnet control (mesh)
- [x] Update docs to reflect platform choices (`implementation-plan.md`, `plan.md`, `readme.md`, `requirements.md`)
- [x] Add architecture overview and request/flow traces (textual)
- [ ] Add rendered architecture diagram image (SVG/PNG)

## Phase 1 — Local Dev Environment
- [x] Ensure Docker Desktop and Compose are assumed prerequisites
- [x] Script: `install_prereqs.sh` installs k3d, kubectl (if needed), tailscale
- [x] Script: `create_org_cluster.sh` creates k3d cluster per org (org-<name>) and applies base namespace/RBAC
- [x] Script: `delete_org_cluster.sh` removes cluster
- [x] Script: `start_orchestrator.sh` runs compose for orchestrator+dashboard
- [x] Add Makefile shortcuts (build, up, down, logs, clean)
- [x] Add .env/.env.example values for tokens and default org

## Phase 2 — Orchestrator Service (Go)
- [x] Minimal HTTP server and handlers (`/health`, `/peers`, `/clusters`, `/schedule`, `/tasks`, `/agents`)
- [x] Buildable container (`src/docker/orchestrator.Dockerfile`)
- [x] Exposed on host 18080→container 8080 via Compose
- [x] Implement minimal in-memory models for tasks/agents (list + schedule)
- [ ] Expand to full CRUD and persistence
- [x] Implement token auth (use `ORCHESTRATOR_TOKEN`) for schedule/mutations
- [x] Add unit tests and basic request validation
 - [x] Add agent loop APIs: `POST /tasks/claim`, `POST /tasks/update`, `POST /tasks/log`

## Phase 3 — Dashboard Service (Node/Express + SPA)
- [x] Server: Express with `/api/health`, `/api/state`, `/api/command`
- [x] UI: simple SPA served at `/ui` (health view)
- [x] Fixed ESM/CJS mismatch; now CommonJS and builds/run via Compose
- [x] Wire Dashboard -> Orchestrator calls for live data (state/tasks)
- [x] Show task events in UI and display last PR link from `/state`
- [x] Add minimal tests (supertest/mocha) and linting (eslint)
 - [x] Add schedule form in UI and server proxy to orchestrator
 - [x] Embed agent code-server in iframe via reverse proxy (with WS support)
 - [x] Distinct UX: Scheduler vs Global Chat (separate intents and flows)
 - Global Chat
    - [x] LLM-backed, org-aware responses (SSE streaming)
    - [x] Chat can initiate tasks via orchestrator; surface provenance in messages
    - [ ] MCP tool connectors for assistant (org context/tools)
    - [x] Guardrails and simple system prompt per org

## Phase 4 — Agent Image & Runtime (Go + editor)
- [x] Go agent binary builds; stubs for:
  - [x] MCP context: `PullContext()`
  - [x] Spec-Kit task run stub: `RunTask()` (invokes `src/spec-kit/cli_wrapper.sh`)
  - [x] Radicle PR stub: `OpenPR()` (invokes `src/radicle/cli_wrapper.sh`)
- [x] Container image builds with startup script and editor service
- [x] Resilient editor service on :8443
  - [x] Attempted code-server install (blocked by Node 22 requirement)
  - [x] Fallback to `python3 -m http.server 8443` to ensure demo works
 - [x] Upgrade agent image to support code-server (standalone binary, arch-aware)
 - [x] Gate editor with auth or token (code-server password via CODE_SERVER_PASSWORD; fallback keeps header auth)
 - [x] Include readiness/liveness probes for editor (:8443)
 - [x] Agent polls orchestrator, claims tasks by org, posts status/log updates
 - [ ] MCP client adapters available to agent for local tools (optional; see orchestrator-led MCP below)

## Phase 5 — Kubernetes Workflow (k3d)
- [x] Create per-org cluster (`create_org_cluster.sh`)
- [x] Deploy agent (`deploy_agent.sh`), fixed YAML indentation and image policy
- [x] Image import to k3d + imagePullPolicy Never for local builds
- [x] Port-forward agent service on 8443 (`open_code_server.sh`)
- [ ] PVC for `/state` and mount in agent; wire to dashboard to read PR/task outputs
- [ ] Resource limits/requests and basic PodSecurity settings
- [ ] Switch imagePullPolicy to IfNotPresent for dev, Always for CI/pushed images

## Phase 6 — Mesh Networking (Headscale/Tailscale)
- [x] Scripts reference Headscale/Tailscale join
- [ ] Make `tailscale_join.sh` robust: ensure tailscaled running; user guidance for macOS
- [ ] Add optional auto-start tailscaled guidance or a no-mesh “local-only” mode
- [ ] Document Headscale server bootstrap and ACLs

## Phase 7 — Integrations & Planning
- [x] Spec-Kit CLI stub invoked from agent
- [x] Radicle PR stub writes last PR URL into `/state/radicle/last_pr.json`
- [ ] Dashboard shows latest PR link and task results from `/state`
- [ ] Orchestrator persists task metadata and exposes to dashboard
- [ ] Add simple “task dispatch” flow from dashboard to orchestrator to agent
 - [ ] LLM + MCP integration for Global Chat (server-side):
    - [ ] MCP registry and connectors for org context (files, repos, knowledge)
    - [ ] LLM provider wiring (env-based); per-org context injection
    - [ ] Chat-to-Task bridge: assistant can create tasks via orchestrator with rationale captured
 - [ ] Orchestrator Planner/Dispatcher:
    - [ ] Decide agent selection or decompose tasks into sub-tasks (DAG)
    - [ ] Track parent/child task relations and provenance
    - [ ] Execute task graph and update statuses/logs; retry basics
    - [ ] Persist plan state; expose to dashboard

## Phase 8 — Dev Experience & Scripts
- [x] `seed_demo_project.sh` creates a local demo repo under `src/state/demo-repo`
- [x] `demo_run.sh` present (lightweight smoke path)
- [ ] Validate and enrich `demo_run.sh` to cover full E2E: seed → schedule → agent → PR stub → dashboard
- [ ] Add `logs` helpers and better error messages to scripts
- [ ] Add platform notes for macOS/Linux differences

## Phase 9 — Observability & Ops
- [ ] Aggregate logs and expose via dashboard (tail recent agent logs)
- [ ] Add Prometheus-style metrics endpoints
- [ ] Add health/readiness endpoints to agent and probes in manifests
- [ ] Minimal tracing hooks for request/response across components

## Phase 10 — Security & Config
- [ ] Enforce tokens on orchestrator and dashboard mutation endpoints
- [ ] Centralize secrets/env handling (.env; Kubernetes Secrets)
- [ ] HTTPS/TLS termination strategy for public surfaces (dev vs prod)
- [ ] Harden container images (non-root user; drop caps) and add SBOM
 - [ ] Manage LLM provider credentials and scopes; audit chat-initiated actions

## Phase 11 — CI/CD & Releases
- [ ] GitHub Actions: build/test for Go + Node; lint; container builds
- [ ] Push images to a registry (ghcr.io); tag by branch/version
- [ ] Automated k3d import for local dev; Helm chart or Kustomize overlays for prod
- [ ] Versioned releases and changelog

## Phase 12 — Talos Integration (next milestone)
- [ ] Document Talos adoption path; replace k3d with Talos-managed clusters
- [ ] Cluster API or automation steps; bootstrap scripts
- [ ] Validate Headscale/Tailscale across Talos clusters

---

## Current Working Demo Path (validated)
1) Bring up local services
   - [x] `src/compose/docker-compose.orchestrator.yml` → orchestrator on :18080, dashboard on :8090
2) Create an org cluster and deploy an agent
   - [x] `./src/scripts/create_org_cluster.sh demo`
   - [x] Build agent image and import to k3d; deploy with `./src/scripts/deploy_agent.sh demo "Build MVP demo"`
3) Access agent workspace/editor port
   - [x] `./src/scripts/open_code_server.sh demo <agent-name>` → browse http://127.0.0.1:8443 (code-server; default password: "password")
4) Schedule a task to orchestrator (token required) — agent claims and executes
   - [x] From dashboard UI or curl: `POST /schedule` (token in `X-Auth-Token`)
5) Optional: Embed code-server in dashboard (enter local forward port, then Load)
6) Global Chat
   - Use “Ask (LLM)” to stream assistant responses; assistant may create a task automatically when appropriate
   - Use “Send (schedule)” to create a task directly without chat reasoning

Notes:
- Orchestrator /health and dashboard /api/health both return `{ "status": "ok" }`.
- Agent flow runs stubs and keeps serving on 8443; code-server uses password auth; fallback HTTP server enforces a header token.

---

## Top next priorities
- [ ] Global Chat MCP connectors (server-side) to provide tools/context via MCP
- [ ] Orchestrator planner/dispatcher to figure out how to solve scheduled tasks (agent selection, decomposition, DAG execution)
- [ ] Persist task logs and expose `/tasks/:id/logs` (SSE live-tail done)
- [ ] Expand orchestrator task CRUD + persistence and expose to dashboard (plans, provenance)
- [ ] PVC for agent `/state` and surface PR URL/artifacts in dashboard
- [ ] CI pipeline for build/test and container publish; switch imagePullPolicy accordingly

---

## Changelog for this backlog
- 2025-10-02: Initial backlog created with status reflecting the working quick-start and identified next steps.
- 2025-10-02: Phase 0–2 completed: architecture doc added, Makefile/.env updated, orchestrator auth + in-memory tasks and tests implemented; schedule endpoint verified.
 - 2025-10-02: Added agent claim/update/log APIs; agent now polls and executes tasks; dashboard can embed code-server via proxy with WS support.
 - 2025-10-02: Reprioritized around distinct Scheduler vs Global Chat. Planned LLM (+ MCP) chat that is org-aware and can initiate tasks, and an orchestrator planner/dispatcher to solve tasks autonomously.
 - 2025-10-02: Implemented Global Chat streaming (SSE) with optional LLM provider, guardrails, and task initiation; UI logs switched to SSE live-tail for agents and tasks; dashboard tests added.
