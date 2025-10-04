# Dashboard E2E Test Policy and Usage

This package only contains real end-to-end tests that talk to a running dashboard and orchestrator, and when applicable, to tailscale/headscale and Talos. No local-mode, mocks, or stubs are used.

## Test files

- `server/setup.e2e.test.ts` — real setup flows (tailscale/headscale) via the running dashboard. Opt-in with environment variables.
- `server/bootstrap.e2e.test.ts` — real org bootstrap via the dashboard to the orchestrator. Skipped unless Talos nodes are provided via env.

## Environment

Export the dashboard URL (self-signed is accepted):

- `DASHBOARD_URL=https://127.0.0.1:8090`
- `DASHBOARD_TOKEN` — token for dashboard routes (defaults to `dashboard-secret`)
- `ORCHESTRATOR_URL` and `ORCHESTRATOR_TOKEN` — must be configured by the running dashboard process

For setup flows (tailscale/headscale), export when running with `RUN_TAILSCALE_E2E=1`:

- `HEADSCALE_URL` — URL to your Headscale server (required for connect flow)
- `TS_AUTHKEY` — reusable Tailscale auth key (required for connect flow)
- `TS_HOSTNAME` — hostname to present on join (required)
- Optional: `SETUP_ALLOW_INTERACTIVE=0` to avoid interactive prompts

For Talos bootstrap:

- `E2E_CP_NODES` — space/comma-separated list of control-plane node IPs (required to enable bootstrap test)
- `E2E_WK_NODES` — optional list of worker node IPs

## Running

- Default run (will skip optional suites when not configured):
  - `npm test`
- Targeted runs:
  - `npm run test:e2e:setup`
  - `E2E_CP_NODES="10.0.0.1 10.0.0.2" E2E_WK_NODES="10.0.0.3" npm run test:e2e:bootstrap`

If you haven’t started the stack yet, use the repo scripts from the repo root to start orchestrator + dashboard first.

## Notes

- Tests expect the environment to be set up as a user would run it. They do not start servers in-process.
- Self-signed certificates are accepted for local development (`NODE_TLS_REJECT_UNAUTHORIZED=0` is set inside tests).
- Long-running tasks (bootstrap) have generous timeouts and are opt-in.
