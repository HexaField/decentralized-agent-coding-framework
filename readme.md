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

3) Run dashboard and orchestrator on the tailnet
- Ensure this machine is joined to your Headscale/Tailscale network (one-time per host):
	```bash
	bash src/scripts/tailscale_join.sh
	```
- Start the services (both run on this host and are reachable to other tailnet devices):
	```bash
	bash src/scripts/start_orchestrator.sh up
	```
- Access over Tailscale from any device on the same tailnet:
	- Dashboard: https://<your-tailnet-IP-or-MagicDNS-name>:8090
	- Orchestrator health: http://<your-tailnet-IP-or-MagicDNS-name>:18080/health
	Note: tokens from your `.env` (DASHBOARD_TOKEN, ORCHESTRATOR_TOKEN) gate mutating actions.

	## Headscale/Tailscale: what’s not automated (yet)

	The scripts get you far, but a few Headscale/Tailscale items still need manual configuration depending on your environment.

	- Headscale server provisioning and DNS/TLS
		- Not automated: installing and operating a production Headscale server (systemd, backups), TLS certs, and DNS name.
		- You need: a reachable `HEADSCALE_URL` with a valid certificate, or use the local dev bootstrap.

	- Headscale admin access for namespace/key management
		- Automated: creating namespaces and reusable preauth keys (external: via SSH to `HEADSCALE_SSH`; local: via dockerized headscale).
		- Not automated: Headscale ACLs, user lifecycle, and token rotation policies.

	- Tailscale auth for the Kubernetes Operator
		- Automated: Operator install if you provide either `TS_OAUTH_CLIENT_ID/TS_OAUTH_CLIENT_SECRET` or `TS_OPERATOR_AUTHKEY`.
		- Not automated: creating the OAuth app or scoped auth key in Tailscale/Headscale; you must generate these and set them in `src/.env`.

	- Host join to tailnet (this machine)
		- Automated: if `HEADSCALE_URL`, `TS_AUTHKEY`, and `TS_HOSTNAME` are set, `setup.sh` attempts to join via `tailscale_join.sh`.
		- Not automated: ensuring you used non-placeholder values and that the Headscale server is reachable; adjust `src/.env` accordingly.

	- MagicDNS and device names
		- Not automated: enabling MagicDNS in your Headscale and ensuring your device has the expected `TS_HOSTNAME`.
		- Outcome: You can use names like `orchestrator-1.tailnet.local` across machines.

	- Cilium and cluster networking
		- Partially automated: org clusters are created; you still need to ensure Cilium (or your CNI) is installed/configured per org.
		- See note emitted by `talos_org_bootstrap.sh` about installing Cilium.

	### Minimal manual checklist
	1) Set real values in `src/.env` (don’t use placeholders)
		 - HEADSCALE_URL=https://headscale.yourdomain.tld
		 - TS_AUTHKEY=tskey-...
		 - TS_HOSTNAME=orchestrator-<your-host>
		 - DASHBOARD_TOKEN / ORCHESTRATOR_TOKEN (secrets you choose)
		 - For Operator: TS_OAUTH_CLIENT_ID/TS_OAUTH_CLIENT_SECRET or TS_OPERATOR_AUTHKEY
	2) If using external Headscale, confirm admin access
		 - SSH works to `HEADSCALE_SSH` and `headscale version` runs
	3) Join this host to the tailnet
		 ```bash
		 bash src/scripts/tailscale_join.sh
		 ```
	4) Install Tailscale Operator per org (if not done by setup)
		 ```bash
		 bash src/scripts/install_tailscale_operator.sh <org>
		 ```
	5) Enable MagicDNS (recommended) in Headscale and confirm device resolves via tailnet DNS
	6) Start orchestrator + dashboard and access over tailnet
		 ```bash
		 bash src/scripts/start_orchestrator.sh up
		 ```

		## Guided setup in the Dashboard (automated flows)

		The dashboard includes two guided flows to automate setup and surface logs in real time. These orchestrate the scripts on your machine and prompt for any inputs that cannot be automated.

		- Create a new cluster (Headscale + Talos + Operator + demo app)
			- The server streams steps over SSE at `/api/setup/stream?flow=create&mode=auto`.
			- It runs: Headscale bootstrap (external or local), Tailscale join, per‑org Talos bootstrap, Tailscale Operator install, demo app, and starts orchestrator+dashboard.
			- Provide `X-Auth-Token: $DASHBOARD_TOKEN` with the request.

		- Connect this device to an existing cluster
			- The server streams steps over SSE at `/api/setup/stream?flow=connect`.
			- It runs: Tailscale join (best effort) and starts orchestrator+dashboard; it also emits hints for missing kubeconfigs.
			- Provide `X-Auth-Token: $DASHBOARD_TOKEN` with the request.

		Validation endpoint
		- POST `/api/setup/validate` returns any missing env/config issues to fix (tokens, Headscale/Tailscale creds, orgs.yaml, etc.).

		UI notes
		- In dev, the UI can consume SSE and show step, log, warn, hint, error, and done events to guide users through any manual steps (e.g., generating TS auth keys or enabling MagicDNS).

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
