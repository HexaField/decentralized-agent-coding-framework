# Developer Guide

## Local run matrix
- macOS
  - Backend in Docker or node; Ollama on host via http://host.docker.internal:11434
  - VM runner via QEMU (no KVM); slower, dev-only
- Linux
  - Backend in Docker or node; Ollama container or host with GPU
  - VM runner with /dev/kvm for acceleration

## Ports
- Host
  - 3000: Frontend
  - 8080: Backend (exposed)
- Private network
  - 7000: MCP
  - 5432: SQL
  - 11434: Ollama
  - 8080: Vector DB (if external)

## Env vars
- API_PORT, CORS_ALLOWED_ORIGINS
- MCP_URL, STORAGE_URL, VECTOR_DB_URL
- OLLAMA_BASE_URL, CLOUD_PROVIDER_BASE_URL, CLOUD_API_KEYS
- SPEC_KIT_* for Spec Kit integration

## Troubleshooting
- CORS errors: ensure backend allows http://localhost:3000
- WebSockets: verify 8080 is exposed and WS upgrades work
- Docker networking (macOS): use host.docker.internal for host services
- KVM permissions (Linux): container needs /dev/kvm and privileged mode
