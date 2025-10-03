import 'dotenv/config'
import http from 'http'

// This revives the agent workflow by exercising the chat entrypoint, which schedules a task
// via orchestrator and triggers a best-effort ensure. We stub the orchestrator responses to
// keep the test hermetic while verifying real dashboard behavior (/api/chat -> /api/state).

describe('Dashboard chat schedules task and shows agent [integration]', () => {
  let dashServer: http.Server | null = null
  let orchServer: http.Server | null = null
  let base: string = 'http://127.0.0.1:0'

  beforeAll(async () => {
    // Start a stub orchestrator first and configure dashboard to use it
    const token = 'test-orch-token'
    process.env.ORCHESTRATOR_TOKEN = token
    const agentList = [
      { name: 'agent-1', org: 'acme', status: 'idle', lastSeen: new Date().toISOString() },
    ]
    orchServer = http.createServer((req, res) => {
      const u = new URL(req.url || '/', 'http://localhost')
      const ok = req.headers['x-auth-token'] === token || !/^\/schedule/.test(u.pathname)
      if (!ok) {
        res.statusCode = 401
        res.setHeader('Content-Type', 'application/json')
        return res.end(JSON.stringify({ error: 'unauthorized' }))
      }
      if (u.pathname === '/schedule' && req.method === 'POST') {
        res.setHeader('Content-Type', 'application/json')
        const id = Date.now().toString()
        return res.end(JSON.stringify({ id, org: 'acme', text: 'task', status: 'scheduled' }))
      }
      if (u.pathname === '/tasks') {
        res.setHeader('Content-Type', 'application/json')
        return res.end(JSON.stringify([]))
      }
      if (u.pathname === '/agents') {
        res.setHeader('Content-Type', 'application/json')
        return res.end(JSON.stringify(agentList))
      }
      if (u.pathname === '/health') {
        res.setHeader('Content-Type', 'application/json')
        return res.end(JSON.stringify({ status: 'ok' }))
      }
      res.statusCode = 404
      res.end('not found')
    })
    await new Promise<void>((resolve) => orchServer!.listen(0, '127.0.0.1', () => resolve()))
    const oaddr = orchServer!.address() as any
    const orchUrl = `http://127.0.0.1:${oaddr.port}`
    process.env.ORCHESTRATOR_URL = orchUrl

    // Now dynamically import the app (after env is set) and start HTTP server on an ephemeral port
    const appMod = await import('./index.js')
    const app = appMod.default
    await new Promise<void>((resolve) => {
      dashServer = http.createServer(app)
      dashServer!.listen(0, '127.0.0.1', () => resolve())
    })
    const addr = dashServer!.address() as any
    base = `http://127.0.0.1:${addr.port}`
  })

  afterAll(async () => {
    if (dashServer) await new Promise((r) => dashServer!.close(() => r(null as any)))
    if (orchServer) await new Promise((r) => orchServer!.close(() => r(null as any)))
  })

  it(
    'accepts chat and state shows at least one agent',
    async () => {
      const org = process.env.ORG || 'acme'
      const r = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': process.env.DASHBOARD_TOKEN || 'dashboard-secret' },
        body: JSON.stringify({ org, text: 'please start an agent' }),
      })
      expect(r.status).toBe(200)
      const body = await r.json()
      expect(body && body.ok).toBe(true)

      // Poll /api/state for an agent to appear (orchestrator stub provides one)
      const deadline = Date.now() + 20_000
      let seen = false
      while (Date.now() < deadline && !seen) {
        const s = await fetch(`${base}/api/state`)
        expect(s.status).toBe(200)
        const sb = await s.json()
        const agents = Array.isArray(sb.agents) ? sb.agents : []
        if (agents.length > 0) {
          seen = true
          break
        }
        await new Promise((r) => setTimeout(r, 500))
      }
      expect(seen).toBe(true)
    },
    60_000
  )
})

// For manual dev, you can still ping: curl -sS -X POST http://127.0.0.1:8090/api/chat -H 'Content-Type: application/json' -d '{"org":"acme","text":"test"}' | jq -C .
