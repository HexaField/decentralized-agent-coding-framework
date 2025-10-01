# Orchestrator backend foundations

This repository includes a minimal orchestrator backend and a build script to produce a Docker image.

Contents
- `backend/`: minimal Express + WebSocket server
- `scripts/build_orchestrator.sh`: builds the Docker image
- `BACKLOG.md`: dot-point project backlog
- `IMPLEMENTATION_PLAN.md`: detailed requirements and plan
- `.env.example`: environment variable template
- `.github/`: CI and PR template
  
Copilot & Spec Kit
- See `.github/COPILOT.md` for using Copilot Chat as an interface to Spec Kit.
- See `docs/SPEC_KIT.md` for setup and commands.
  
Simple architecture overview
- Local web UI runs on host (e.g., http://localhost:3000)
- Orchestrator backend runs in Docker (exposes :8080 to host)
- Internal private network connects backend ↔ MCP ↔ storage/vector DB ↔ agents/VMs ↔ Ollama
- Only backend port is exposed; all other services stay private

Quickstart
1. Build the image (optional tag):
   - scripts/build_orchestrator.sh latest
2. Run the container:
   - docker run --rm -p 8080:8080 -e CORS_ALLOWED_ORIGINS=http://localhost:3000 orchestrator-backend:latest

Endpoints
- GET /health, /ready
- POST /v1/jobs
- GET /v1/context/search?q=...
- WS /v1/stream

Tune with env vars
- API_PORT (default 8080)
- CORS_ALLOWED_ORIGINS (comma-separated)

Contributing
- See `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md`.

License
- MIT (see `LICENSE`).

Spec Kit
- See `docs/SPEC_KIT.md` for using GitHub’s Spec Kit (Specify CLI) in this repo.

## Progress

- [x] Minimal orchestrator (health/ready, mock jobs/context, WS stream)
- [x] Dockerized backend + build script (smoke-tested)
- [x] Linting/testing (ESLint, Vitest + Supertest) and CI (lint/test/Docker build)
- [x] Repo scaffolding (gitignore, editor/VS Code, PR template, LICENSE, contributing, CoC)
- [x] Docs (Architecture, Implementation Plan, Spec Kit, Copilot, Dev notes)
- [ ] Local web UI wired to backend
- [ ] Ollama integration + model routing
- [ ] Spec Kit as orchestrator tool (runtime endpoints)
- [ ] Persistence (SQLite/Postgres) + vector store
- [ ] AuthN/AuthZ + secrets management
- [ ] Observability (logs, metrics, tracing)
- [ ] Agent/VM container networking/orchestration
- [ ] API expansion + OpenAPI spec
- [ ] Reverse proxy (Caddy/Traefik) + prod hardening
- [ ] E2E tests and CI caching
