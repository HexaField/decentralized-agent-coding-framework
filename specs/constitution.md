# Constitution

Authoritative sources
- Architecture: ../decentralized_ai_dev_architecture.md
- Implementation plan: ../IMPLEMENTATION_PLAN.md
- Backlog: ../backlog.md

Principles
- Composability: capabilities as replaceable services; minimal coupling; sidecars only for cross-cutting concerns.
- Modularity: strict module boundaries; public interfaces over internal reach; feature flags for runtime switches.
- Dependency Injection: inject providers (LLM, vector, storage, MCP, logger, metrics) by config/env; swap without code changes.
- Interoperability: open protocols (HTTP/JSON, WS; gRPC optional), portable auth, data portability (export/import for context & vectors).

Governance
- Local-first with cloud fallback; provider policy is configurable per-request and per-deployment.
- Single exposed backend port; all other services on a private network.
- Security baseline: non-root, least caps, secrets via env/secrets, rate limits/quotas.
- Observability baseline: JSON logs; metrics; optional tracing; provider/model/tokens/latency recorded.

Out-of-scope (phase 1)
- Full multi-tenant RBAC; advanced autoscaling/scheduling; cross-region failover.
