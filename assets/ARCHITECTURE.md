# Architecture Overview

This document outlines the MVP system context, key components, and request/flow traces.

## System context

- Orchestrator (Go): centralized lightweight control plane, exposes REST API, peers with others.
- Dashboard (Node/Express + SPA): UI + minimal API for health/state and commands.
- Agent (Go + editor): spawned in Kubernetes clusters per organization.
- Mesh: Headscale/Tailscale for secure peer-to-peer connectivity.
- Clusters: k3d (MVP) today; Talos planned next.

## Component diagram (textual)

- User
  - interacts with Dashboard
- Dashboard
  - reads Orchestrator state (tasks, agents, clusters)
  - posts commands (schedule task)
- Orchestrator
  - tracks tasks/agents in-memory (MVP)
  - creates K8s Deployments via scripts or future operator
- Agent
  - pulls context, runs task stub, exposes editor on :8443
  - writes PR stub output to /state

## Request/flow traces

- Health checks
  - GET /health (orchestrator), GET /api/health (dashboard)
- Schedule flow (MVP)
  - Dashboard POST /schedule (to orchestrator) with { org, task }
  - Orchestrator accepts, records task in memory, returns 202 + agent hint
  - Operator/script deploys agent to the org cluster (MVP uses deploy script)
- Agent lifecycle (MVP)
  - Pod starts, runs stubs, keeps editor serving
  - PR stub writes last_pr.json to /state
  - Dashboard will surface that artifact in next iteration

## Next

- Replace script-driven scheduling with real orchestrator→K8s integration
- Add persistence for tasks/agents
- Add auth, RBAC, and peer lifecycle
