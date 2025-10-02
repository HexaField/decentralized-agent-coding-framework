# Decentralized Agent Coding Framework

A production-ready, decentralized, AI‑augmented development platform that securely connects people and coding agents across machines and organizations. It provides a unified orchestrator, distributed Kubernetes clusters per organization, and a web dashboard with AI assistance—so tasks flow from idea to reviewed PR with traceable, human‑in‑the‑loop control.

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

What works today (local, single device):

- Orchestrator (Go) with token-protected scheduling and in-memory state
  - Endpoints: `/health`, `/tasks`, `/agents`, `POST /schedule`
  - New agent APIs for MVP loop: `POST /tasks/claim`, `POST /tasks/update`, `POST /tasks/log`
- Dashboard (Node/Express + SPA)
  - Aggregates orchestrator state (`/api/state`), schedules tasks via proxy
  - Embeds an agent’s code-server in an iframe via a safe reverse proxy
- Agent (Go) container with real code-server runtime
  - Downloads standalone code-server binary; password auth enabled
  - Polls orchestrator, claims tasks for its org, runs stubs (Spec‑Kit + Radicle), updates status
  - Exposes editor on 8443 with readiness/liveness probes
- Kubernetes via k3d per org, with scripts to create clusters and deploy agents

End-to-end demo path:
1) Start orchestrator + dashboard: see `src/README.md` quick start
2) Create an org cluster and deploy an agent (e.g., `acme`)
3) Schedule a task from the dashboard; the agent claims it, runs, and completes
4) Open code-server directly or embedded in the dashboard (password default: `password`)

What’s next for MVP polish:
- Dashboard auto-refresh (or SSE) to show live status changes without manual refresh
- Persist and stream task logs to the dashboard
- Basic persistence for orchestrator state

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
Active development on the MVP is underway. See `src/README.md` for the runnable demo, and `backlog.md` for detailed status and next steps. The long-term vision above remains, with MVP focusing on a simple schedule → execute → PR flow with live observability.
