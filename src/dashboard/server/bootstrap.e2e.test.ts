import {
  DASHBOARD_URL,
  DASHBOARD_TOKEN as TOKEN,
  E2E_ORG as ORG,
  E2E_CP_NODES as CP_NODES,
  E2E_WK_NODES as WK_NODES,
} from './e2e.env.js'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve as any, ms as any))
}

// Real bootstrap path via orchestrator; must be configured in .env
describe('E2E: org bootstrap via dashboard', () => {
  it('creates org, bootstraps cluster, and persists kube/talos config', async () => {
    // health
    const h = await fetch(`${DASHBOARD_URL}/api/health`).catch(() => null as any)
    if (!h || h.status !== 200) throw new Error('Dashboard not reachable at DASHBOARD_URL[_TEST]')

    if (!CP_NODES.length) {
      throw new Error(
        'E2E_CP_NODES[_TEST] must be set with at least one control-plane IP to run bootstrap test'
      )
    }

    // create org (idempotent)
    let r = await fetch(`${DASHBOARD_URL}/api/orgs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': TOKEN },
      body: JSON.stringify({ name: ORG }),
    })
    if (r.status !== 409) {
      expect(r.status).toBe(200)
      const b = await r.json()
      expect(b).toHaveProperty('ok', true)
    }

    // bootstrap via orchestrator
    r = await fetch(`${DASHBOARD_URL}/api/orgs/${encodeURIComponent(ORG)}/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': TOKEN },
      body: JSON.stringify({ cpNodes: CP_NODES, workerNodes: WK_NODES }),
    })
    const bodyTxt = await r.text()
    if (r.status !== 200) throw new Error(`bootstrap failed: status=${r.status} body=${bodyTxt}`)
    const boot = JSON.parse(bodyTxt)
    expect(boot).toHaveProperty('ok', true)
    expect(typeof boot.kubeconfig).toBe('string')

    // poll status endpoints for persisted files
    const deadline = Date.now() + 120000
    let haveTalos = false
    let haveKube = false
    while (Date.now() < deadline && (!haveTalos || !haveKube)) {
      await sleep(1500)
      const ts = await fetch(
        `${DASHBOARD_URL}/api/orgs/${encodeURIComponent(ORG)}/talosconfig/status`
      ).then((x) => (x.ok ? x.json() : { ok: false }))
      haveTalos = Boolean(ts && ts.ok && ts.exists)
      const ks = await fetch(
        `${DASHBOARD_URL}/api/orgs/${encodeURIComponent(ORG)}/kubeconfig/status`
      ).then((x) => (x.ok ? x.json() : { ok: false }))
      haveKube = Boolean(ks && ks.ok && ks.exists)
    }
    expect(haveTalos).toBe(true)
    expect(haveKube).toBe(true)
  }, 600_000)
})
