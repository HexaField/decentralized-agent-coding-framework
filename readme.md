# Decentralized Agent Coding Framework

Build software with autonomous agents across organizations and machines.

![Screenshot_2025-10-02_at_21 37 53](https://github.com/user-attachments/assets/a6d062fe-9dc2-4b28-b5a4-906ea49fda3b)

Highlights
- Orchestrator (Go) for scheduling and monitoring
- Web dashboard (Node/TypeScript) for chat, logs, and control
- Talos per‑org Kubernetes clusters (default)
- Tailscale/Headscale mesh for secure connectivity

## Quickstart

Local dev (no Tailscale)
1) Start orchestrator and dashboard
```bash
bash src/scripts/start_orchestrator.sh up
```
2) Open the dashboard
https://127.0.0.1:8090
3) Optional: run the dashboard UI in dev mode (hot reload)
```bash
cd src/dashboard
npm install
npm run dev
```

Headscale + Talos (external Headscale)
1) Copy and edit environment/config
```bash
cp .env.example .env
cp docs/orgs.example.yaml orgs.yaml
# Set HEADSCALE_URL and HEADSCALE_SSH in .env, and edit node IPs in orgs.yaml
```
2) Run the unified setup
```bash
bash src/scripts/setup.sh external
```
This performs preflight checks, bootstraps Headscale namespaces and keys, sets up org clusters, installs the Tailscale Operator, and deploys a small demo app.

## Current progress

- Orchestrator image (Go)
	- Runs via Docker Compose with token‑gated write endpoints
	- Uses per‑org Talos kubeconfigs; k3d paths deprecated
- Dashboard (Node/TypeScript)
	- HTTPS dev mode, chat/log proxy, SSE streams, Vite UI
- Agent (Go)
	- Stub loop, code‑server runtime, basic probes and logs
- Talos + Headscale path
	- Scripts for external Headscale bootstrap, Talos org bootstrap, Tailscale Operator install, and a demo app
	- Dynamic orgs via `orgs.yaml` with yq helpers
- Security defaults
	- Local/tailnet binding and tokens for mutations by default
- CI
	- Go builds, dashboard tests/lint, Docker builds, ShellCheck

## Planned features

- Unified orchestrator image
- Hardening and peer orchestration across tailnet
	- mTLS between orchestrators; signed workloads and SBOMs
	- Capacity exchange across peers with policy‑aware placement
- Distributed Talos‑managed clusters per organization
- Multi‑cluster scheduling, quotas, and policy controls
- Identity separation (user vs. agent)
- Secrets/identity management and least‑privilege defaults
- Agent workflow (Spec‑Kit, code‑server, Radicle, Obsidian)
- Planner/dispatcher, persistence for tasks/agents/logs, MCP integrations
- Task and workflow management
- Persisted state, provenance, DAG execution, retries
- Unified dashboard
- Polished UX, richer controls, and multi‑org views
- Secure connectivity and defaults
- Baseline NetworkPolicies and RBAC profiles per workload class
- Human‑in‑the‑loop
- Review bots and policy gates before merges
- Extensible workloads (beyond coding agents)
- CI runners, data/ML, DocOps, security tooling, observability stack


## Docs
- Architecture: `assets/ARCHITECTURE.md`
- Talos + Headscale runbook: `docs/talos-headscale-mode.md`

## License
See `LICENSE`.
