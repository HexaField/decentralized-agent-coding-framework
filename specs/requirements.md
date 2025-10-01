# Requirements & User Stories

High-level capabilities
- Per-machine orchestrator exposes scheduling APIs and WS streams; peers over Tailscale.
- Local inference first (Ollama) with cloud fallback; per-request override.
- Context plane (MCP) for ingest/search/pack; storage and vector adapters.

User stories
- As a developer, I can request a workload (/schedule) and monitor it over WS.
- As a developer, I can search context relevant to my job.
- As an operator, I can route LLM calls locally or to cloud based on policy.
- As an operator, I can add/remove nodes/agents and have the orchestrators adapt automatically.

Non-functional
- Idempotent scheduling; CORS for http://localhost:3000 in local dev; minimal exposed ports.
- Structured logs and basic metrics; optional tracing.
- Security: non-root containers; secrets via env; basic auth scopes (phase 1); Tailscale ACLs.
