# Requirements & User Stories

High-level capabilities
- Orchestrate agent and VM work via a single backend API and WS stream.
- Local inference first (Ollama) with cloud fallback; per-request override.
- Context plane (MCP) for ingest/search/pack; storage and vector adapters.

User stories
- As a developer, I can submit a job to the backend and watch progress over WS.
- As a developer, I can search context relevant to my job.
- As an operator, I can route LLM calls locally or to cloud based on policy.
- As an operator, I can add/remove agent/VM containers without frontend changes.

Non-functional
- Idempotent job submission; CORS for http://localhost:3000; single exposed port.
- Structured logs and basic metrics; optional tracing.
- Security: non-root containers; secrets via env; basic auth scopes (phase 1).
