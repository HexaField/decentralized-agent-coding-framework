# Technical Implementation Plan (concise)

Phases
- M0 Foundations: container network, backend on :8080, CORS/WS OK.
- M1 Context & Storage: MCP reachable; storage wired (SQLite/Postgres); search flow.
- M2 Local inference: Ollama reachable; provider routing (local-first, cloud-fallback).
- M3 Agents & VMs: 1 agent + 1 VM container integrated with job lifecycle.
- M4 Observability & Security: logs/metrics/tracing baseline; rate limits; secrets; non-root.
- M5 Production: reverse proxy TLS; persistence; GPU enablement; runbooks.

Contracts
- REST: /health, /ready, /v1/jobs, /v1/jobs/:id, /v1/jobs/:id/cancel, /v1/context/search
- WS: /v1/stream (status/log/result/error/heartbeat)
- OpenAPI: /openapi.json

Config
- API_PORT, CORS_ALLOWED_ORIGINS; MCP_URL, STORAGE_URL, VECTOR_DB_URL, OLLAMA_BASE_URL; PROVIDER_POLICY.
