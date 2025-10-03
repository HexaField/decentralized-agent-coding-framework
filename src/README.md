# Distributed AI-Augmented Dev Lab — MVP

This MVP runs a local orchestrator and agent pods across a Headscale/Tailscale mesh with per-organization k3d clusters. It demonstrates end-to-end: task dispatch → agent execution (with code-server) → PR via Radicle stub → task tracking via Spec‑Kit stub.

## Prerequisites

- Headscale server reachable; you have HEADSCALE_URL and a reusable TS_AUTHKEY
- Docker Desktop or Docker Engine + docker-compose
- k3d, kubectl (install script provided)

## Quick Start (single device)

1. Copy env and set values:
   cp .env.example .env
2. Install prerequisites:
   ./scripts/install_prereqs.sh
3. Join Tailscale via Headscale:
   ./scripts/tailscale_join.sh
4. Create an org cluster:
   ./scripts/create_org_cluster.sh acme
5. Start orchestrator + dashboard:
   ./scripts/start_orchestrator.sh
   - Orchestrator: http://127.0.0.1:18080/health
   - Dashboard: http://127.0.0.1:8090/ui
6. Seed demo project:
   ./scripts/seed_demo_project.sh
7. Deploy an agent:
   ./scripts/deploy_agent.sh acme "Hello world web task"
8. Open code‑server for the agent:
   ./scripts/open_code_server.sh acme <agent-name>
   Then browse http://127.0.0.1:8443 and use the password from CODE_SERVER_PASSWORD (default: password).

## Multi-device

Run the same steps on 2–3 machines. Edit `orchestrator/configs/orchestrator.example.yaml` to list peer Tailscale hostnames via MagicDNS. The scheduler can place on a remote peer’s org cluster when labels match.

## What’s inside

- Local orchestrator (Go) exposing /health, /peers, /clusters, /schedule, /tasks, /agents
- Agent (Go) with code-server runtime and simple workflow hook
- Dashboard (Node/Express + static UI) listing users, agents, devices, clusters, tasks, PRs
- Spec‑Kit and Radicle stubs for tasks and PRs

## Docs

- Architecture overview: `../assets/ARCHITECTURE.md`

## Teardown

- Stop services: docker compose -f compose/docker-compose.orchestrator.yml down
- Delete cluster: ./scripts/delete_org_cluster.sh acme

## Make targets

- make test:local — spins a single org cluster, schedules one agent, verifies PR stub
- make test:multi — requires 2 peers in config; schedules remote agent by label
