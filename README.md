# Decentralized Agent Coding Framework

Decentralized, AI‑augmented development platform with per‑machine orchestrators that peer over Tailscale and schedule workloads onto local Kubernetes nodes/pods. Local Dev mode runs a Dockerized backend and host‑local UI, matching the same architecture.

## Goal

- Build a composable, modular, DI‑friendly platform to coordinate agents/VMs and LLMs.
- Prefer local inference (Ollama) with cloud fallback. Keep only the backend exposed to the host.

## How it works

- Each machine runs a lightweight orchestrator that manages local k8s workloads (k3s/microk8s/kubelet).
- Orchestrators peer over Tailscale and negotiate workload placement; logs/results stream back to the requester.
- MCP provides context (ingest/search/pack); Obsidian vault feeds MCP; agents consume context.
- Spec‑Kit tracks tasks/requirements; agents can update it.
- Local dev mode: Dockerized backend on :8080 and host UI on :3000; agent/VM/Ollama as sibling containers.

API surface (current)

- REST: GET /health, GET /ready, POST /v1/jobs, GET /v1/jobs/:id, POST /v1/jobs/:id/cancel, GET /v1/context/search
- WS: /v1/stream (status/heartbeat)
- OpenAPI outline: GET /openapi.json

See `ARCHITECTURE.md` and `IMPLEMENTATION_PLAN.md` for details.

## Status

- [x] Minimal orchestrator (health/ready, mock jobs/context, WS stream)
- [x] Dockerized backend + build script (smoke‑tested)
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
- [ ] Peer discovery via Tailscale; negotiation protocol
- [ ] Kubernetes integration (k3s/microk8s) for per‑machine scheduling

## Get started

Local dev (backend)

- cd backend
- npm run dev (TypeScript via tsx)
- API on http://localhost:8080

Docker (orchestrator only)

- scripts/build_orchestrator.sh
- docker run --rm -p 8080:8080 -e CORS_ALLOWED_ORIGINS=http://localhost:3000 orchestrator-backend:latest

Root scripts

- Build image: npm run build:orchestrator
- Run image: npm run run:orchestrator
- Start local (no Docker): npm run start:orchestrator:local

Common env

- API_PORT (default 8080)
- CORS_ALLOWED_ORIGINS (comma‑separated)

## Spec Kit

- Docs: `docs/SPEC_KIT.md`
- Quickstart: `scripts/spec_kit_init_here.sh` (installs persistent Specify CLI if needed), `scripts/spec_kit_check.sh`
- Specs live in `specs/` (see `specs/system.md`)

## Contributing

- See `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md`.

## License

- MIT (see `LICENSE`).
