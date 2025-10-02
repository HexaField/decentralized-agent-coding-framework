# Backlog — Epics and Features

A concise, end‑to‑end view of what’s done and what’s next for the decentralized, AI‑augmented dev lab MVP.

Quick links
- Orchestrator: http://127.0.0.1:18080/health
- Dashboard: http://127.0.0.1:8090/ui (API: /api/health)
- Agent (local forward): http://127.0.0.1:8443/

Repository map
- Orchestrator: `src/orchestrator/app`
- Dashboard server: `src/dashboard/server`
- Dashboard UI: `src/dashboard/ui`
- Agent: `src/agent/app`
- Compose/K8s/Scripts: `src/compose`, `src/k8s`, `src/scripts`

---

## Epic A — Foundations & Dev Experience
Completed
- Workspace scripts for k3d clusters, deploy, and port‑forwards
- Minimal Makefile shortcuts
- ESLint + Prettier
- Vitest (baseline; tests TBD)
- Shared env file `.env` (server + client) and dotenv loading
- Dev flow without builds: tsx for server, Vite dev for UI (proxied via server)

Upcoming
- Add smoke tests for dashboard server routes and SSE
- Add example `.env.example` sync and validation

## Epic B — Orchestrator (Go)
Completed
- Endpoints: `/health`, `/tasks`, `/agents`, `POST /schedule`
- Agent loop APIs: `POST /tasks/claim`, `POST /tasks/update`, `POST /tasks/log`
- In‑memory task/agent stores
- SSE streams: `/events/tasks`, `/events/agents`
- Task/agent log buffers: `/tasks/logs`, `/agents/logs`
- Token auth for mutating endpoints

Upcoming
- Persistence for tasks/agents/logs (disk or DB)
- Full task CRUD, provenance, parent/child relations
- Planner/dispatcher (selection, decomposition, DAG execution, retries)
- Metrics endpoint

## Epic C — Agent Runtime (Go + Editor)
Completed
- Agent loop claims tasks, posts status and logs
- Editor runtime on :8443 (code‑server or Python fallback)
- Health probes and basic auth (password or header)

Upcoming
- MCP client adapters for local tools
- PVC for `/state`; surface PR/artifacts to dashboard
- Resource limits/requests and PodSecurity configuration

## Epic D — Dashboard Server (Node/Express)
Completed
- TypeScript server with routes: `/api/health`, `/api/state`, `/api/command`
- Proxies to orchestrator; dev `/ui` proxy to Vite
- SSE proxy endpoints: `/api/stream/task`, `/api/stream/agent`
- Log fetch endpoints: `/api/taskLogs`, `/api/agentLogs`
- Streaming chat endpoint `/api/chat/stream` that schedules tasks
- Reverse proxy for embedded editors: `/embed/local/:port` (with WS upgrades)
- CORS (configurable via CORS_ORIGINS/FRONTEND_ORIGIN)

Upcoming
- LLM integration for chat responses (provider env + guardrails)
- Harden auth on mutating routes; tokens and rate‑limits
- Vitest route tests and SSE tests

## Epic E — Dashboard UI (Vite + SolidJS + Tailwind)
Completed
- SolidJS app (Org Chat + Tasks + Agents + Editor embed)
- Live logs via EventSource (tasks/agents); chat streams via SSE
- Backend base URL selection (VITE_SERVER_URL or same‑host mapping)

Upcoming
- UI polish, error states, and retries
- Agent controls (ensure/spawn) and PR surfacing
- Solid router and feature tabs

## Epic F — Kubernetes & Mesh
Completed
- k3d cluster creation/deletion scripts
- Agent deployment script; image import for local builds
- Port‑forward helper for editor

Upcoming
- Talos/Headscale integration path and docs
- Switch imagePullPolicy based on dev/CI

## Epic G — Observability & Ops
Completed
- SSE log streaming path from agent → orchestrator → dashboard → UI

Upcoming
- Log aggregation and persistence
- Prometheus metrics; basic tracing hooks

## Epic H — Security & Config
Completed
- Tokened orchestrator mutations
- CORS and frame/csp header handling for embeds
- Shared `.env` for server and client

Upcoming
- mTLS strategy (or service mesh) between services
- TLS termination strategy for public surfaces
- Secrets management and SBOM/hardening for images

## Epic I — Integrations (LLM, MCP, Radicle, Spec‑Kit)
Completed
- Spec‑Kit and Radicle stubs invoked from agent

Upcoming
- LLM provider wiring for chat
- MCP registry and connectors (org tools/context)
- Persist and surface PR links and artifacts in dashboard
- Chat‑to‑Task bridge with rationale capture

---

## Current demo path
1) Orchestrator up (local or compose) → http://127.0.0.1:18080/health
2) Dashboard dev (from `src/dashboard`): `npm run dev` → http://127.0.0.1:8090/ui
3) Create an org cluster and deploy an agent; port‑forward editor :8443
4) Use Org Chat to schedule a task (streams) and watch logs live
5) Optionally embed the editor by entering the local forward port

Notes
- Orchestrator and dashboard health return `{ "status": "ok" }`.
- Editor auth is enabled; fallback server uses header token.

---

## Next priorities
- Persist tasks/agents/logs; expose provenance
- Planner/dispatcher (selection, decomposition, DAG)
- LLM + MCP integration for useful chat/tooling
- PVC for agent state and artifact surfacing
- CI pipeline for build/test and image publish
