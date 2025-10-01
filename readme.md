# Decentralized Agent Coding Framework

A production-ready, decentralized, AI‑augmented development platform that securely connects people and coding agents across machines and organizations. It provides a unified orchestrator, distributed Kubernetes clusters per organization, and a web dashboard with AI assistance—so tasks flow from idea to reviewed PR with traceable, human‑in‑the‑loop control.

## What it is

- Single orchestrator image that runs on your machine and peers with others over Tailscale
- Per‑organization Kubernetes clusters for scheduling agent pods and workloads
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
- Tailscale mesh: private, encrypted connectivity across nodes and orgs
- Kubernetes: workload placement, quotas, policies, and isolation per org
- Agents: VS Code Server, CLI toolchain (Copilot/Codex, linters, tests), PR automation
- Spec‑Kit: tasks, requirements, and workflow state tracking
- Memory & Context Plane (MCP): semantic context, logs, embeddings, PR metadata
- Radicle + Obsidian: decentralized VCS and knowledge base integration

## Progress

High‑level phases that map to the three parts of the system.

- [ ] Phase 1 — Resource Mesh + Dashboard
  - [ ] Orchestrator image with API (health, capacity, schedule, evict, pods)
  - [ ] Tailscale integration and ACLs
  - [ ] Per‑org Kubernetes cluster discovery and registration
  - [ ] AI‑enhanced dashboard (users, agents, tasks, PRs, logs)

- [ ] Phase 2 — Agent Workflow
  - [ ] Spec‑Kit task intake and dispatch
  - [ ] Agent pod lifecycle (context build, code‑server, CLI workflows)
  - [ ] PR automation with Radicle; review loop with humans/bots
  - [ ] Streaming logs, status, and artifacts to dashboard/MCP

- [ ] Phase 3 — Extended Workloads
  - [ ] CI/CD ephemeral runners
  - [ ] Data/ML jobs and vector indexing
  - [ ] DocOps and security tooling
  - [ ] Observability stack and artifact caches

## Security by design

- Tailscale device identity and node tags
- mTLS between orchestrators; signed workload manifests
- Kubernetes RBAC, NetworkPolicies, and per‑workload quotas
- Least‑privilege, time‑bound agent credentials distinct from users

## Status

This repository tracks the specification and implementation of the system described above. See `plan.md` for detailed goals, interfaces, and dependencies.
