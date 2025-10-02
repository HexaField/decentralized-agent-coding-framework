# Project Backlog and Status

A living, end-to-end backlog tracking what’s built, what’s verified, and what’s next for the distributed AI-augmented dev lab MVP.

Current quick links:
- Orchestrator: http://127.0.0.1:18080/health
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

## Phase 3 — Dashboard Service (Node/Express + SPA)
- [x] Server: Express with `/api/health`, `/api/state`, `/api/command`
- [x] UI: simple SPA served at `/ui` (health view)
- [x] Fixed ESM/CJS mismatch; now CommonJS and builds/run via Compose
- [x] Wire Dashboard -> Orchestrator calls for live data (state/tasks)
- [x] Show task events in UI and display last PR link from `/state`
- [x] Add minimal tests (supertest/mocha) and linting (eslint)
 - [x] Add schedule form in UI and server proxy to orchestrator

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

## Phase 7 — Stubs & Integrations
- [x] Spec-Kit CLI stub invoked from agent
- [x] Radicle PR stub writes last PR URL into `/state/radicle/last_pr.json`
- [ ] Dashboard shows latest PR link and task results from `/state`
- [ ] Orchestrator persists task metadata and exposes to dashboard
- [ ] Add simple “task dispatch” flow from dashboard to orchestrator to agent

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
4) Schedule a task to orchestrator (token required)
   - [x] `curl -X POST http://127.0.0.1:18080/schedule -H 'X-Auth-Token: <token>' -d '{"org":"acme","task":"demo"}'`

Notes:
- Orchestrator /health and dashboard /api/health both return `{ "status": "ok" }`.
- Agent flow runs stubs and keeps serving on 8443; current editor is a static http fallback (no auth).

---

## Top next priorities
- [ ] Improve agent readiness: ensure 200 /health before marking Ready (code-server can take a moment to start)
- [ ] Dashboard show PR/task outputs from `/state` and orchestrator’s live task list
- [ ] Expand orchestrator to full CRUD + persistence (and expose to dashboard)
- [ ] PVC for agent `/state` with persistence; surface PR URL in dashboard
- [ ] CI pipeline for build/test and container publish; switch imagePullPolicy accordingly

---

## Changelog for this backlog
- 2025-10-02: Initial backlog created with status reflecting the working quick-start and identified next steps.
- 2025-10-02: Phase 0–2 completed: architecture doc added, Makefile/.env updated, orchestrator auth + in-memory tasks and tests implemented; schedule endpoint verified.
