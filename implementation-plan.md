# Implementation Plan (RFC 2119)

This plan describes how to implement the Decentralized Agent Coding Framework from the ground up using test‑driven development (TDD). RFC 2119 requirement keywords (MUST, SHOULD, MAY) are used to specify behavior and priorities. Each feature MUST include:
- Contract tests (API/schema) and unit tests.
- Integration tests runnable in CI and in an isolated local environment.
- Minimal docs and an example to smoke‑test the feature.

---

## Environments & Tooling

- Local: Docker, Talos (as Kubernetes OS/cluster manager), Tailscale client managed by Headscale, make or task runner.
- CI: Containerized jobs; Talos cluster provisioned via QEMU/Firecracker or Docker-in-Docker; a Tailscale substitute or sandbox (wireguard‑based stub) MUST be provided to exercise control paths without exposing secrets. Headscale MUST be used as the Tailscale control server in CI.
- Languages/Stacks: Keep pluggable; initial reference MUST provide containerized services and scripts.

Global testing principles:
- Tests MUST be hermetic, parallelizable, and idempotent.
- Networked tests SHOULD use ephemeral namespaces and random ports.
- Secrets MUST be injected via CI secrets managers; test fixtures MUST use scoped tokens.

---

## Phase 1 — Resource Mesh & Dashboard

Milestones:

1) Orchestrator Base Image
- MUST build a single container image that boots the orchestrator.
- MUST expose GET /health and basic logging.
- Tests: unit (health handler), contract (OpenAPI), image build smoke test.

2) Tailscale Mesh Integration
- MUST join a Tailscale network coordinated by Headscale (or stub in CI) and expose device identity and tags to the orchestrator.
- MUST enforce ACL checks in control‑plane requests via Headscale policies.
- Tests: integration (mesh join/stub via Headscale), ACL deny/allow cases, mTLS handshake tests.

3) Capacity & Discovery
- MUST report capacity (CPU/RAM/GPU/tags) and node health.
- MUST discover/register per‑org clusters managed by Talos; SHOULD support multiple clusters per host.
- Tests: unit (capacity collector), integration (cluster registration on Talos), contract (GET /capacity, GET /pods schemas).

4) Scheduling & Placement (MVP)
- MUST accept POST /schedule with workload manifest and placement constraints.
- SHOULD implement simple scoring by capacity and tags; MAY support quotas initially as static policy.
- Tests: contract (schedule request/response), integration (pod visible in Talos-managed cluster), e2e (sample workload scheduled and observed).

5) Dashboard (Read‑Mostly)
- MUST render nodes, clusters, pods, capacity, and health.
- MUST restrict writes by RBAC; MUST use mTLS for backend calls.
- Tests: UI smoke (headless), API contract, RBAC negative tests.

Exit criteria for Phase 1: All acceptance criteria in `requirements.md` Phase 1 MUST pass in CI and local runs.

---

## Phase 2 — AI Workflow with Knowledge & Spec MCPs

Milestones:

1) Agent Identity & Pod Lifecycle
- MUST run agent pods with distinct, least‑privileged credentials.
- MUST expose logs/metrics; MUST bootstrap code‑server.
- Tests: unit (identity loader), integration (pod startup), e2e (agent visible in dashboard).

2) Task Intake (Spec‑Kit) & Dispatch
- MUST create/update tasks via Spec‑Kit and dispatch to agents.
- Tests: contract (Spec‑Kit APIs), integration (task picked up), e2e (task state changes in dashboard).

3) MCP Connectors
- Obsidian MCP MUST read query sets and MAY write/update notes as configured.
- Git/Radicle MCP MUST branch/commit/push and open PRs.
- Spec‑Kit writing MCP MUST update task specs/status.
- Tests: unit (connectors), integration (vault access, PR open), e2e (spec updates reflected).

4) Automated Workflow
- Agents MUST run CLI toolchains (linters/tests) and summarize results.
- On success, MUST open a PR and post artifacts; on failure, MUST post diagnostics and retry per policy.
- Tests: e2e with a toy repo, deterministic linters/tests, PR opened, feedback consumed.

5) Review Loop
- Agents SHOULD handle reviewer comments with another iteration.
- Tests: simulated comments leading to a new commit and updated PR status.

Exit criteria for Phase 2: All acceptance criteria in `requirements.md` Phase 2 MUST pass in CI and local runs.

---

## Phase 3 — On‑Demand Job Framework

Milestones:

1) Job Types & Templates
- MUST provide templates for: CI runner, ML batch/notebook, DocOps, Security scan.
- Tests: unit (template params), integration (job submission), e2e (each template runs to completion).

2) Policy & Placement
- MUST honor tag constraints and quotas; MUST enforce admission controls.
- Tests: policy negative/positive, placement correctness on multi‑node mesh.

3) Observability & Artifacts
- MUST collect logs/metrics/traces; MUST publish artifacts to configured stores.
- Dashboard MUST render job status/history and artifact links.
- Tests: artifact existence, logs visible, basic performance thresholds.

Exit criteria for Phase 3: All acceptance criteria in `requirements.md` Phase 3 MUST pass in CI and local runs.

---

## CI & Local Execution

- A make/task target MUST run the full test matrix locally (with Tailscale stub) and in CI.
- Talos MUST provision clusters for tests (e.g., using talosctl with QEMU); ephemeral namespaces per run.
- e2e tests MUST seed minimal fixtures (toy repo, vault snippets, task samples).
- Test reports (JUnit), coverage, and lightweight SBOM SHOULD be published from CI.

## Documentation & Examples

- Each milestone MUST include a README section and a minimal example.
- A quickstart MUST exist to spin up Phase 1 locally with stubbed mesh.
- Troubleshooting docs SHOULD include common ACL/RBAC and cluster issues.

## Risk & Rollback

- Feature flags MUST guard new capabilities.
- Canary rollout SHOULD be used for orchestrator changes.
- Rollback procedures MUST be documented for cluster resources and credentials.
