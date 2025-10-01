# System overview

This repository implements a Dockerized orchestrator backend (TypeScript/Node) with WebSocket streaming and a local-first AI development architecture. The backend runs in a container (port 8080) and laterally connects to MCP, storage, vector store, agents, VM containers, and Ollama on a private Docker network. A local web UI on the host targets http://localhost:8080.

Key docs
- Architecture: ../decentralized_ai_dev_architecture.md
- Implementation plan: ../IMPLEMENTATION_PLAN.md
- Backlog: ../backlog.md

Interfaces (current)
- REST: GET /health, GET /ready, POST /v1/jobs, GET /v1/jobs/:id, POST /v1/jobs/:id/cancel, GET /v1/context/search
- WS: /v1/stream (status/heartbeat)
- OpenAPI outline: GET /openapi.json

Principles
- Composability and modular adapters (providers, storage, vector)
- DI via env/config; swappable local/cloud providers
- Interoperability with open protocols; local-first with cloud fallback

Non-goals (phase 1)
- Full multi-tenant RBAC and autoscaling; advanced scheduling
