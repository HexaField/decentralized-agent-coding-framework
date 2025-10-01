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
