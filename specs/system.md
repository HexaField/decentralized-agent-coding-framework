# System overview

This repository implements a decentralized AI-augmented development architecture: per-machine orchestrators peer over Tailscale and schedule workloads onto local Kubernetes nodes/pods. MCP provides context; Spec-Kit tracks tasks; Radicle supports decentralized collaboration; Obsidian vault supplies knowledge. Local Dev mode runs a Dockerized backend (port 8080) with sibling containers, matching the same architecture.

Key docs
- Architecture: ../ARCHITECTURE.md
- Implementation plan: ../IMPLEMENTATION_PLAN.md
- Backlog: ../backlog.md

Interfaces
- REST: GET /health, POST /schedule, GET /pods, POST /evict, POST /task-update, GET /context/search
- WS: /stream/{id} (status/heartbeat/log/result)
- OpenAPI outline: GET /openapi.json

Principles
- Composability and modular adapters (providers, storage, vector)
- DI via env/config; swappable local/cloud providers
- Interoperability with open protocols; local-first with cloud fallback

Non-goals (phase 1)
- Full multi-tenant RBAC and autoscaling; advanced scheduling
