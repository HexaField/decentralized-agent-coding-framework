# Orchestrator backend foundations

This repository includes a minimal orchestrator backend and a build script to produce a Docker image.

Contents
- `backend/`: minimal Express + WebSocket server
- `scripts/build_orchestrator.sh`: builds the Docker image
- `BACKLOG.md`: dot-point project backlog

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
