import 'dotenv/config'

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://127.0.0.1:8090'
const TOKEN = process.env.DASHBOARD_TOKEN || 'dashboard-secret'

const ORG = process.env.E2E_ORG || `e2e-${Math.random().toString(36).slice(2,8)}`
const CP_NODES = (process.env.E2E_CP_NODES || '').split(/[,\s]+/).filter(Boolean)
const WK_NODES = (process.env.E2E_WK_NODES || '').split(/[,\s]+/).filter(Boolean)

function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve as any, ms as any)) }

// This test requires a reachable Talos environment; it is opt-in and will be skipped unless E2E_CP_NODES provided.
(CP_NODES.length ? describe : describe.skip)('E2E: Bootstrap org via dashboard -> orchestrator talosctl', () => {
  it('creates org, bootstraps, and returns kubeconfig path', async () => {
    // create org
    let r = await fetch(`${DASHBOARD_URL}/api/orgs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': TOKEN },
      body: JSON.stringify({ name: ORG }),
    })
    if (r.status === 409) {
      // exists, fine
    } else {
      expect(r.status).toBe(200)
      const b = await r.json()
      expect(b).toHaveProperty('ok', true)
    }

    // bootstrap
    r = await fetch(`${DASHBOARD_URL}/api/orgs/${encodeURIComponent(ORG)}/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': TOKEN },
      body: JSON.stringify({ cpNodes: CP_NODES, workerNodes: WK_NODES }),
    })
    expect(r.status).toBe(200)
    const boot = await r.json()
    expect(boot).toHaveProperty('ok', true)
    expect(typeof boot.kubeconfig).toBe('string')

    // wait briefly then check status endpoints reflect real files
    await sleep(1000)
    r = await fetch(`${DASHBOARD_URL}/api/orgs/${encodeURIComponent(ORG)}/talosconfig/status`)
    expect(r.status).toBe(200)
    const ts = await r.json()
    expect(ts).toMatchObject({ ok: true, exists: true })

    r = await fetch(`${DASHBOARD_URL}/api/orgs/${encodeURIComponent(ORG)}/kubeconfig/status`)
    expect(r.status).toBe(200)
    const ks = await r.json()
    expect(ks).toMatchObject({ ok: true, exists: true })
  }, 600_000) // up to 10 minutes for real bootstrap
})
