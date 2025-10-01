# Tasks (actionable)

- Orchestrator
  - [ ] Define OpenAPI spec and validation for /health, /ready, /v1/jobs, /v1/stream, /v1/context/search.
  - [ ] Implement provider router wiring and policy envs.
  - [ ] Add auth scopes and secrets handling.
  - [ ] Add metrics endpoint and tracing hooks.
  - [ ] Implement /health, /pods, /schedule, /evict, /task-update and WS /stream/{id}.
  - [ ] Peer discovery via Tailscale and negotiation protocol.
  - [ ] Kubernetes integration (k3s/microk8s/kubelet) for placement.
- MCP & storage
  - [ ] Define ingest/search contracts; pick storage (SQLite/Postgres) and vector (FAISS/remote).
- Agents/VMs
  - [ ] Integrate 1 agent and 1 VM workload; implement job handoff and logs.
- Observability/Security
  - [ ] Rate limits/quotas; structured logs; basic dashboards; ACLs and audit.
- Frontend
  - [ ] UI for submit/monitor jobs; WS reconnect; provider overrides.
