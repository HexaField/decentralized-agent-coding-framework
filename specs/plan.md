# Technical Implementation Plan (concise)

Phases
- M0 Foundations: Docker backend on :8080, CORS/WS OK, MCP/storage/vector/Ollama reachable.
- M1 Local orchestrator: capacity report, /pods, local scheduling to k3s/microk8s.
- M2 Peer discovery & negotiation: Tailscale hostnames, scoring, /schedule across nodes.
- M3 Kubernetes integration: remote placement; ephemeral pods for agents/VMs/code-server.
- M4 Spec‑Kit & MCP: orchestrator updates tasks; MCP context packs; observability/security baseline.
- M5 Production: reverse proxy TLS; persistence; GPU; ACLs; audit; runbooks.

Contracts
- REST: /health, /schedule, /pods, /evict, /task-update, /context/search
- WS: /stream/{id} (status/log/result/error/heartbeat)
- OpenAPI: /openapi.json

Config
- API_PORT, CORS_ALLOWED_ORIGINS; MCP_URL, STORAGE_URL, VECTOR_DB_URL, OLLAMA_BASE_URL; PROVIDER_POLICY; Tailscale node/ACL identifiers; k8s context.
