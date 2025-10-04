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

Headscale + Talos (via Dashboard)
1) Start orchestrator and dashboard (if not already)
```bash
bash src/scripts/start_orchestrator.sh up
```
2) Open the dashboard and use “Connect this device”
- Join existing network: enter Headscale URL, TS Auth Key, and a hostname for this machine.
- Create new network (Local): choose Local, provide a hostname; the dashboard will bootstrap a local Headscale and generate a TS auth key for you.
- Create new network (External): choose External, enter Headscale URL and an admin SSH (e.g., admin@host); the dashboard will create namespaces/keys on the remote Headscale.

The Create flow performs preflight checks and can bootstrap org clusters, install the Tailscale Operator, and deploy a small demo app.

3) Bootstrap or provide Talos config, then generate kubeconfig (GUI; once per org)
- In the dashboard Org Manager, you can now Bootstrap a cluster: select the org, enter control-plane node IPs (and optional workers), and click Bootstrap. The orchestrator runs `talosctl gen config`, applies configs to nodes, bootstraps the cluster, persists `~/.guildnet/state/talos/<org>.talosconfig`, and writes `~/.guildnet/state/kube/<org>.config`.
- Alternatively, upload or paste an existing Talos config, then enter the Talos endpoint (IP/DNS) and click “Generate kubeconfig”.

Note: When a new org is created, placeholder files are auto-created at `~/.guildnet/state/talos/<org>.talosconfig` and `~/.guildnet/state/kube/<org>.config` using templates in `src/configs/templates/`. The dashboard treats placeholders as “missing” until they contain real content. With Bootstrap, these become real automatically; otherwise upload a Talos config and then generate the kubeconfig.

4) Install the AgentTask CRD and Operator into the org cluster (one-time per cluster)
```bash
# from repo root, with your KUBECONFIG pointing at the org cluster
kubectl apply -k src/k8s/operator
```

5) Prepare the namespace used by the operator (default: mvp-agents)
- In the dashboard Org Manager, click "Prepare Namespace" (or run via API: POST /k8s/prepare).

6) Schedule a task for that org (CRD/operator flow)
- Use the dashboard chat to send a task for your org (e.g., "acme").
- The orchestrator creates an AgentTask CR; the Operator reconciles an Agent Deployment/Service.
- Access the editor via the dashboard link or the orchestrator’s editor proxy.

7) Access over Tailscale from any device on the same tailnet
- Dashboard: https://<your-tailnet-IP-or-MagicDNS-name>:8090
- Orchestrator health: http://<your-tailnet-IP-or-MagicDNS-name>:18080/health
Note: tokens from your `.env` (DASHBOARD_TOKEN, ORCHESTRATOR_TOKEN) gate mutating actions.

## Cleanup

# From repo root (macOS zsh)
docker rm -f headscale-local 2>/dev/null || true
docker volume rm headscale-data 2>/dev/null || true
docker network ls --format '{{.Name}}' | grep -E 'tailscale|headscale' | xargs -r docker network rm
rm -rf ~/.guildnet/state/_tmp/headscale
rm -f ~/.guildnet/state/dashboard.db

Tailscale teardown (optional)

```bash
# macOS: sign out and quit the app
tailscale logout || true
osascript -e 'tell application "Tailscale" to quit' || true

# Linux: disconnect and stop the service
sudo tailscale down || true
sudo tailscale logout || true
sudo systemctl stop tailscaled 2>/dev/null || sudo service tailscaled stop 2>/dev/null || true

# If you changed login servers and want to clear client prefs/state
# (macOS usually does not need sudo; Linux typically does)
tailscale up --reset --force-reauth 2>/dev/null || sudo tailscale up --reset --force-reauth 2>/dev/null || true
```

## Current progress

- Orchestrator image (Go)
	- Runs via Docker Compose with token‑gated write endpoints
	- Uses per‑org Talos kubeconfigs
- Dashboard (Node/TypeScript)
	- HTTPS dev mode, chat/log proxy, SSE streams, Vite UI
- Agent (Go)
	- Stub loop, code‑server runtime, basic probes and logs
- Talos + Headscale path
	- Scripts for external Headscale bootstrap, Talos org bootstrap, Tailscale Operator install, and a demo app
	- Dynamic orgs are created and managed via the dashboard
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
- Architecture: `architecture.md`

## License
See `LICENSE`.
