# Decentralized Agent Coding Framework

A production-ready, decentralized, AI‑augmented development platform that securely connects people and coding agents across machines and organizations. It provides a unified orchestrator, distributed Kubernetes clusters per organization, and a web dashboard with AI assistance—so tasks flow from idea to reviewed PR with traceable, human‑in‑the‑loop control.

![Screenshot_2025-10-02_at_21 37 53](https://github.com/user-attachments/assets/a6d062fe-9dc2-4b28-b5a4-906ea49fda3b)

## What it is

- Single orchestrator image that runs on your machine and peers with others over Tailscale
- Per‑organization Kubernetes clusters (Talos-managed) for scheduling agent pods and workloads
- Clear separation of user vs. agent identity and credentials
- Agents that build context, code, test, document, and open PRs automatically
- AI‑enhanced dashboard for visibility and natural‑language control
- Secure-by-default mesh networking, RBAC, mTLS, and signed workloads

## How it works (high level)

1. You define or pick a task in Spec‑Kit from your local orchestrator.
2. The orchestrator schedules an agent pod to the best org cluster via Tailscale.
3. The agent builds task context (repo, MCP, notes), runs code‑server for access, and executes the workflow.
4. The agent pushes a branch and opens a PR (Radicle); humans/bot reviewers provide feedback.
5. Status, logs, and artifacts stream to the dashboard; everything is auditable and traceable.

## Key components

- Orchestrator API: health, capacity, scheduling, eviction, and pod listing
- Tailscale mesh (Headscale-controlled): private, encrypted connectivity across nodes and orgs
- Kubernetes (Talos-managed): workload placement, quotas, policies, and isolation per org
- Agents: VS Code Server, CLI toolchain (Copilot/Codex, linters, tests), PR automation
- Spec‑Kit: tasks, requirements, and workflow state tracking
- Memory & Context Plane (MCP): semantic context, logs, embeddings, PR metadata
- Radicle + Obsidian: decentralized VCS and knowledge base integration

## Progress (MVP)

What works today (local, single device)

- Orchestrator (Go)
  - Endpoints: `/health`, `/tasks`, `/agents`, `POST /schedule`
  - Agent loop APIs: `POST /tasks/claim`, `POST /tasks/update`, `POST /tasks/log`
  - In‑memory stores; SSE streams for tasks/agents; log buffers and fetch endpoints
  - Token auth for mutations
- Dashboard (Node/Express + SolidJS)
  - TypeScript server with `/api/health`, `/api/state`, `/api/command`
  - Proxies to orchestrator, SSE proxy for logs, streaming chat that schedules tasks
  - Reverse proxy to embed local editors with WS upgrades
  - Dev without builds: tsx for server, Vite dev for UI (proxied at `/ui`)
- Agent (Go)
  - Polls, claims, executes stubs (Spec‑Kit + Radicle), posts status/logs
  - Editor on 8443 (code‑server or Python fallback), password/header auth; probes
- Kubernetes via k3d
  - Scripts to create per‑org clusters, deploy agents, import images, and port‑forward editor

Demo path
1) Start orchestrator (compose or local)
2) From `src/dashboard`, run `npm run dev` and open http://127.0.0.1:8090/ui
3) Create an org cluster and deploy an agent (e.g., `acme`)
4) Use Org Chat to schedule a task; watch logs stream; embed the editor via local forward port

What’s next
- Persist tasks/agents/logs and provenance; planner/dispatcher
- LLM + MCP connector integration for chat/tools
- PVC for agent state and artifact surfacing in dashboard

## Security by design

- Tailscale device identity and node tags via Headscale
- mTLS between orchestrators; signed workload manifests
- Kubernetes RBAC, NetworkPolicies, and per‑workload quotas
- Least‑privilege, time‑bound agent credentials distinct from users

## Documents

- High-level requirements: `requirements.md`
- Implementation plan (RFC 2119 + TDD/CI): `implementation-plan.md`
- Architecture overview and flow traces: `assets/ARCHITECTURE.md`
- Backlog and status: `backlog.md`

## Status
Active development on the MVP is underway. See `backlog.md` for the epics and feature breakdown, including what’s complete and upcoming.
