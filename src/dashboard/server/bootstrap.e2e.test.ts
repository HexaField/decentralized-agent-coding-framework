import 'dotenv/config'
import http from 'http'
import app from './index.js'
// Allow self-signed dashboard certs in dev for E2E
process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0'

let server: http.Server | null = null
let base: string = ''
const TOKEN = process.env.DASHBOARD_TOKEN || 'dashboard-secret'

const ORG = process.env.E2E_ORG || `e2e-${Math.random().toString(36).slice(2, 8)}`
const CP_NODES = (process.env.E2E_CP_NODES || '').split(/[,\s]+/).filter(Boolean)
const WK_NODES = (process.env.E2E_WK_NODES || '').split(/[,\s]+/).filter(Boolean)

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve as any, ms as any))
}

// This test requires a reachable Talos environment and is opt-in. Enable with RUN_BOOTSTRAP_E2E=1 and provide E2E_CP_NODES.
const RUN = process.env.RUN_BOOTSTRAP_E2E === '1'
;((RUN && CP_NODES.length) ? describe : describe.skip)(
  'E2E: Bootstrap org via dashboard -> orchestrator talosctl',
  () => {
    beforeAll(async () => {
      await new Promise<void>((resolve) => {
        server = http.createServer(app)
        server!.listen(0, '127.0.0.1', () => resolve())
      })
      const addr = server!.address() as any
      base = `http://127.0.0.1:${addr.port}`
    })

    afterAll(async () => {
      if (server) await new Promise((r) => server!.close(() => r(null as any)))
    })
    it('creates org, bootstraps, and returns kubeconfig path', async () => {
      // preflight: dashboard health
  const DASHBOARD_URL = base
  let r = (await fetch(`${DASHBOARD_URL}/api/health`).catch((e) => ({
        status: 0,
        err: e,
      }))) as any
      if (!r || r.status !== 200)
        throw new Error(`dashboard /api/health failed: ${r && r.status} ${(r && r.err) || ''}`)
      // create org
  r = await fetch(`${DASHBOARD_URL}/api/orgs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': TOKEN },
        body: JSON.stringify({ name: ORG }),
      })
      if (r.status === 409) {
        // exists, fine
      } else {
        if (r.status !== 200) {
          const txt = await r.text().catch(() => '')
          throw new Error(`create org failed: ${r.status} ${txt}`)
        }
        const b = await r.json()
        expect(b).toHaveProperty('ok', true)
      }

      // bootstrap
  r = await fetch(`${DASHBOARD_URL}/api/orgs/${encodeURIComponent(ORG)}/bootstrap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': TOKEN },
        body: JSON.stringify({ cpNodes: CP_NODES, workerNodes: WK_NODES }),
      })
      if (r.status !== 200) {
        const txt = await r.text().catch(() => '')
        throw new Error(`bootstrap failed: ${r.status} ${txt}`)
      }
      const boot = await r.json().catch(() => ({}))
      if (!boot || !boot.ok) throw new Error(`bootstrap not ok: ${JSON.stringify(boot)}`)
      expect(typeof boot.kubeconfig).toBe('string')

      // poll status endpoints to reflect real files
      const deadline = Date.now() + 120000
      let haveTalos = false
      let haveKube = false
      while (Date.now() < deadline && (!haveTalos || !haveKube)) {
        await sleep(1500)
        // talos
  r = await fetch(`${DASHBOARD_URL}/api/orgs/${encodeURIComponent(ORG)}/talosconfig/status`)
        if (r.status === 200) {
          const ts = await r.json().catch(() => ({}))
          haveTalos = Boolean(ts && ts.ok && ts.exists)
        }
        // kube
  r = await fetch(`${DASHBOARD_URL}/api/orgs/${encodeURIComponent(ORG)}/kubeconfig/status`)
        if (r.status === 200) {
          const ks = await r.json().catch(() => ({}))
          haveKube = Boolean(ks && ks.ok && ks.exists)
        }
      }
      if (!haveTalos || !haveKube)
        throw new Error(`status not ready (talos=${haveTalos} kube=${haveKube})`)
    }, 600_000) // up to 10 minutes for real bootstrap
  }
)
