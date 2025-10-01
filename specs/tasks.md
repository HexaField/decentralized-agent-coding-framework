# Tasks (actionable)

- Backend
  - [ ] Define OpenAPI spec (expand /openapi.json) and validation.
  - [ ] Implement provider router wiring and policy envs.
  - [ ] Add auth scopes and secrets handling.
  - [ ] Add metrics endpoint and tracing hooks.
- MCP & storage
  - [ ] Define ingest/search contracts; pick storage (SQLite/Postgres) and vector (FAISS/remote).
- Agents/VMs
  - [ ] Integrate 1 agent and 1 VM container; implement job handoff and logs.
- Observability/Security
  - [ ] Rate limits/quotas; structured logs; basic dashboards.
- Frontend
  - [ ] UI for submit/monitor jobs; WS reconnect; provider overrides.
