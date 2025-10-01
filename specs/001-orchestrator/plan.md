# Plan: Orchestrator and Local Dev

This feature implements the decentralized orchestrator APIs and Local Dev mode per `architecture.md` and `IMPLEMENTATION_PLAN.md`.

- Runtime: Node.js 20, TypeScript (ESM)
- Backend paths: `backend/src/**`, tests under `backend/tests/**`
- Key APIs: GET /health, POST /schedule, GET /pods, POST /evict, POST /task-update, WS /stream/{id}
- Context: MCP (ingest/search/context), vector adapters; provider router (Ollama local-first, cloud fallback)
- K8s: k3s/microk8s via `@kubernetes/client-node`
- Mesh: Tailscale for peer discovery (simulated in tests initially)

Refer to `../tasks.md` for the executable task list.
