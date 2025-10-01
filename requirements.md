# High-Level Requirements Specification

This document defines the end-state requirements across three phases of the Decentralized Agent Coding Framework. It captures functional and non‑functional expectations and the acceptance criteria that determine when each phase is complete.

Scope: Orchestrator, mesh networking, dashboard, agent workflow, knowledge/context management, PR automation, and an extensible job framework.

---

## Global Constraints and Definitions

- Mesh networking: Tailscale (device identity, ACLs, encrypted overlay)
- Orchestration: Kubernetes (k3s/microk8s/managed K8s acceptable)
- VCS: Radicle for decentralized PR flows (or compatible adapter)
- Knowledge: Obsidian vault integration (read/write where applicable)
- Tasks/specs: Spec‑Kit as the source of tasks and requirements state
- MCP: Memory & Context Plane providing semantic context, logs, embeddings
- Security: mTLS between orchestrators; signed workload manifests; K8s RBAC/NetworkPolicies

Non‑functional (applies to all phases):
- Security hardening, least‑privilege credentials, auditable actions
- Observability (structured logs, metrics, traces) and basic dashboards
- Reliability: graceful degradation and backoff/retry for mesh/network issues
- Clear operator UX: minimal manual steps to bootstrap and observe

---

## Phase 1 — Resource Mesh & Dashboard (End‑State Requirements)

Goal: A working resource mesh and a unified dashboard operating over Tailscale and Kubernetes.

Functional requirements:
- Orchestrator
  - Single container image runs on a node and joins the mesh.
  - Announces capacity (CPU, RAM, GPU, tags) and health to peers.
  - Exposes APIs: GET /health, GET /capacity, POST /schedule, POST /evict, GET /pods.
  - Discovers and registers one or more per‑organization Kubernetes clusters.
- Mesh & Security
  - All control traffic is over Tailscale with device identity and ACL enforcement.
  - mTLS is used for orchestrator‑to‑orchestrator and dashboard calls.
- Scheduling & Placement
  - Basic placement across nodes based on available capacity and tags.
  - Policy hooks for quotas and simple admission checks.
- Dashboard
  - Web UI shows users, agents, nodes, clusters, tasks, PR links, and basic logs/metrics.
  - Read‑only views for health/capacity/pods; controlled write operations with RBAC.

Non‑functional requirements:
- Startup time under a few minutes on commodity hardware.
- Minimal external dependencies (container runtime, Tailscale client, K8s cluster access).
- Telemetry surfaced in the dashboard (node health, capacity, recent schedule actions).

Acceptance criteria (Phase 1 complete when all below are true):
- Two or more nodes on the same Tailscale network appear in the dashboard with real health/capacity.
- At least one org cluster is registered and visible with live pod listing.
- A sample workload scheduled via POST /schedule is placed on a node and visible in the dashboard.
- API endpoints respond with correct schemas and pass contract tests.
- Security checks: mTLS verified, Tailscale ACL denies unauthorized calls, RBAC prevents forbidden actions.

---

## Phase 2 — AI Workflow with Knowledge & Spec MCPs (End‑State Requirements)

Goal: An operational AI‑assisted development workflow with context/knowledge management, git/PR automation, and specification authoring via MCPs.

Functional requirements:
- Task Intake & Dispatch
  - Spec‑Kit tasks can be created/updated and dispatched by the orchestrator to an agent pod.
- Agent Pod
  - Runs the same base image with distinct agent credentials.
  - Boots a code‑server for human access and exposes logs/metrics.
  - Builds task context: syncs repo, pulls MCP context, syncs relevant Obsidian notes.
- MCP Connectors/Tools
  - Obsidian MCP: query, retrieve, and optionally write/update notes.
  - Git/Radicle MCP: branch, commit, push, and open PR operations.
  - Spec‑Kit writing MCP: update task specs/acceptance criteria and post status.
- Workflow Automation
  - Agents can run CLI toolchains (Copilot/Codex, linters, tests) to implement tasks.
  - On success, agents open a PR with links and summarized diffs; on failure, they post diagnostics.
- Review Loop
  - Human/bot reviewers can comment; agent can iterate on requested changes.

Non‑functional requirements:
- Identity isolation: user vs. agent credentials and scoped, time‑bound tokens.
- Full traceability: logs, diffs, decisions stored in MCP and visible via dashboard.
- Failure recovery: retries, resumable workflow, clear error surfaces in dashboard.

Acceptance criteria (Phase 2 complete when all below are true):
- E2E demo: A task created in Spec‑Kit is picked up by an agent, context is assembled, changes are implemented, tests pass, and a PR is opened.
- Obsidian MCP used to read context notes and write/update at least one note.
- Spec‑Kit writing MCP updates task status/spec text as the agent progresses.
- Radicle MCP opens a PR; dashboard shows PR link and live agent logs.
- Reviewer feedback triggers at least one revision cycle handled by the agent.

---

## Phase 3 — On‑Demand Job Framework (End‑State Requirements)

Goal: Spin up various jobs on demand using the shared resource mesh.

Functional requirements:
- Job Types & Templates
  - CI/CD ephemeral runners that execute per‑PR.
  - Data/ML jobs (notebook server, batch task, or vector indexing) with resource tags.
  - DocOps (site generation) triggered on changes.
  - Security tooling (SAST/DAST/SBOM/license) triggered by policies.
- Scheduling & Policy
  - Tag‑based placement (e.g., gpu:true, region:us‑west) with quotas and admission controls.
  - Job lifecycle: submit, queue, start, monitor, collect artifacts, and teardown.
- Observability & Artifacts
  - Logs/metrics/traces per job; artifacts published to configured stores.
  - Dashboard pages for job status, history, and artifacts.

Non‑functional requirements:
- Isolation and least privilege for every job class.
- Reasonable defaults for resource requests/limits; overridable by policy.

Acceptance criteria (Phase 3 complete when all below are true):
- At least one example for each job type (CI runner, ML job, DocOps, Security scan) runs on demand from dashboard/API.
- Jobs land on nodes meeting tag constraints; quotas and admission policies enforced.
- Artifacts are collected and visible; logs/metrics/traces are queryable from the dashboard.

---

## Out of Scope (initial releases)
- Federated identity across multiple IdPs (beyond Tailscale device identity and scoped tokens).
- Advanced multi‑tenant billing/chargeback.
- Complex data governance features (beyond basic ACLs and role‑based access).

## Assumptions
- Contributors can run Docker and access a local or remote K8s cluster.
- Tailscale is available for development/testing (or a sanctioned local stub for CI).
- Access to Radicle remotes and an Obsidian vault is configurable per environment.
