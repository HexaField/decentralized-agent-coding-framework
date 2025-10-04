# Architecture Overview

This document captures the current architecture at a high level: the core components, how they interact, and the main request/flow traces. It reflects the CRD/operator-only design that is implemented in this repo today.

## System context

- Orchestrator (Go)
  - Lightweight control plane with a REST API.
  - Tracks tasks and agents in memory (MVP) and submits AgentTask Custom Resources to org clusters.
  - No imperative/script deployments; the Operator owns reconciliation.
- Dashboard (Node/Express + SPA)
  - Web UI for operators and a minimal server for health/state and commands.
  - Proxies/sends scheduling requests to the Orchestrator.
- Agent (Go + code-server)
  - Runs inside each organization’s Kubernetes cluster.
  - Created and managed by the Operator in response to AgentTask CRs.
  - Pulls context, executes work, and exposes an editor (code-server) on port 8443.
  - Emits artifacts (e.g., last_pr.json) into a shared state path.
- Mesh (Headscale/Tailscale)
  - Provides secure peer-to-peer connectivity between local/dev services and cluster-resident agents.
  - Uses a local Headscale controller and the Tailscale Operator for K8s when applicable.
- Clusters (Talos per organization)
  - Each org has its own Talos-managed Kubernetes cluster.
  - Agents are deployed on a per-org basis.

## Component diagram

```mermaid
graph TD
  D["Dashboard (UI + minimal API)"]
  O["Orchestrator (Go REST)"]

  subgraph Mesh["Headscale/Tailscale Mesh"]
    subgraph OrgCluster["Org Cluster (Talos per org)"]
      A["Agent Pod (Go)"]
      CS["code-server :8443"]
      ST["~/.guildnet/state (last_pr.json)"]
      A --> CS
      A --> ST
      AT["AgentTask (CRD)"]
    end
  end

  D -->|"POST /schedule {org, task}"| O
  O -->|"create AgentTask CR"| AT
  AT -->|"reconciles"| A

  %% Mesh-secured connectivity for interactive/editor access
  D -. P2P via mesh .- A
  O -. P2P via mesh .- A
```

## Detailed flow (sequence) diagram

```mermaid
sequenceDiagram
    autonumber
    participant UI as Dashboard UI
    participant D as Dashboard Server
    participant O as Orchestrator
    participant K as Org K8s API (Talos)
    participant OP as Agent Operator (controller)
    participant AP as Agent Pod (code-server)
    participant HS as Headscale/Tailscale

    Note over UI,D: Tailnet setup (create or connect)
    UI->>D: /api/setup/stream (flow=create|connect)
    alt create (local Headscale)
      D->>HS: Bootstrap Headscale (container) and generate TS_AUTHKEY
    else connect (existing Headscale)
      UI->>D: Provide HEADSCALE_URL, TS_AUTHKEY, TS_HOSTNAME
    end
    D->>HS: tailscale up (non-interactive, fallback interactive)
    HS-->>D: device joined to tailnet

  Note over D,O: Cluster bootstrap (optional)
    UI->>D: Create org (SQLite), upload/generate talosconfig/kubeconfig
    D->>O: POST /orgs/bootstrap {org, cpNodes, workerNodes}
    O->>O: talosctl gen/apply/bootstrap & write kubeconfig to state
    O-->>D: kubeconfig path (~/.guildnet/state/kube/<org>.config)

  Note over K,OP: Install CRD/operator in ns=mvp-agents
    D->>K: Apply CRD + SA/Role/RoleBinding + Operator Deployment
    K->>OP: Start controller manager

  Note over D,O: Schedule and reconcile a task
    UI->>D: Chat/schedule request
    D->>O: POST /schedule {org, task}
    O->>K: Create AgentTask (CRD) in ns=mvp-agents
    K->>OP: Reconcile AgentTask
    OP->>K: Create Secret (env), Deployment, Service (:8443)
    K-->>OP: Deployment Available
    OP->>K: Update AgentTask.status (phase=Running, agentName)

  Note over AP,O: Agent registration + logs
    AP->>O: register, heartbeat, claim task, logs
  Note over O,D: Orchestrator streams state to Dashboard
    O-->>D: /tasks, /agents, SSE streams

  Note over D,O: Editor access
    opt via orchestrator port-forward
      D->>O: /agents/editor/open (ensure kubectl port-forward)
      D->>O: /embed/orchestrator/:port (reverse proxy)
    end
    opt via Tailscale Operator (future)
      OP->>K: Expose Service on tailnet (TS proxy)
      UI->>AP: Access code-server over tailnet
    end
```

## Request/flow traces

- Health checks
  - Orchestrator exposes GET /health
  - Dashboard exposes GET /api/health
- Schedule task (CRD path)
  - Dashboard sends schedule request to Orchestrator (POST /schedule with { org, task })
  - Orchestrator accepts, records task in memory, and creates an AgentTask CR in the org cluster
  - The Operator reconciles the CR: creates Secret/Deployment/Service for the Agent and sets status/conditions
- Agent lifecycle
  - Agent pod starts in the org cluster
  - Agent pulls context and runs task-specific logic
  - Agent exposes code-server on :8443 for live editing
  - Agent writes artifacts to ~/.guildnet/state (e.g., last_pr.json)
- Artifacts surfacing
  - Dashboard surfaces agent artifacts and status where available

## Data and configuration

- Organizations
  - Orgs are managed by the Dashboard (SQLite) and associated configs (Talos/kube) live under the shared state dir.
  - A repo-local `orgs.yaml` may exist for examples or scripts, but it is not required at runtime.
  - Generated kubeconfigs are written under `~/.guildnet/state/kube/<org>.config` for internal use by Dashboard/Orchestrator.
- Orchestrator
  - Orchestrator configs live under `src/orchestrator/configs` and the container includes `talosctl` and `kubectl`.
  - Agents read env from the Operator-provisioned Secret (includes `ORCHESTRATOR_URL`, `ORCHESTRATOR_TOKEN`, etc.).
- Dashboard
  - Certs for local TLS in src/dashboard/certs (used for dev/test)
  - Minimal state under ~/.guildnet/state (e.g., dashboard.db, kube/talos configs)
- Agent
  - Writes state/artifacts under ~/.guildnet/state inside the environment
  - Exposes code-server on port 8443 via a Service; the Orchestrator can port-forward for browser access

### State directories and environment

- Base state dir resolution (effective for both Dashboard and Orchestrator):
  - If `GUILDNET_STATE_DIR` is set, use it.
  - Else if `GUILDNET_HOME` is set, use `${GUILDNET_HOME}/state`.
  - Else if `GUILDNET_ENV=dev`, default to `~/.guildnetdev/state`; otherwise `~/.guildnet/state`.
- Kubeconfigs per org: `${state}/kube/<org>.config`
- Talos configs per org: `${state}/talos/<org>.talosconfig`
- Dashboard DB: `${state}/dashboard.db`

## Networking and security

- Mesh
  - Headscale (local) and Tailscale provide secure overlay networking
  - Tailscale Operator can expose in-cluster services via Tailscale
- Editor access
  - Agent’s code-server runs on port 8443 inside the cluster.
  - Today: Dashboard asks Orchestrator to open a kubectl port-forward and reverse-proxies `/embed/orchestrator/:port` for in-browser access.
  - Future: Tailscale Operator can expose the Service directly onto the tailnet for cross-device access without port-forwarding.
- Certificates
  - The Dashboard’s dev server can use self-signed certs from src/dashboard/certs
- AuthZ/AuthN
  - Token-based auth between Dashboard and Orchestrator; RBAC within clusters via Operator service account
  - Agents need a reachable `ORCHESTRATOR_URL` (ideally the host’s Tailscale IP/port via `PUBLIC_ORCHESTRATOR_URL`) to call back from the cluster.

## What’s in place vs. what’s next

- In place
  - Orchestrator REST API and in-memory task/agent tracking
  - Dashboard UI + minimal API, end-to-end scheduling via Orchestrator
  - CRD/operator flow: AgentTask CRD and per-cluster Operator manage agents
  - Agent stubs, context pulling stubs, and code-server on :8443
  - Headscale/Tailscale integration scripts and Talos bootstrap scripts
- Next
  - Package and install the Agent Operator per cluster (image build + kustomize/helm install automation)
  - Ensure agent images are available to clusters (registry push or node preload; imagePullSecrets if private)
  - Set and validate `PUBLIC_ORCHESTRATOR_URL` so agents can reach the orchestrator over the tailnet
  - Optional: adopt Tailscale Operator to expose agent Services on the tailnet (no port-forward)
  - Persist tasks/agents and artifacts beyond in-memory; improve Dashboard surfacing (PRs, logs, status)
