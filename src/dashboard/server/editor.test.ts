import 'dotenv/config'
import http from 'http'
import httpProxy from 'http-proxy'

// This test validates the /api/editor/open flow and the /embed/orchestrator/:port proxy by
// standing up a stub orchestrator that exposes /agents, /agents/editor/open and /editor/proxy/:port
// endpoints. The proxy target serves a simple HTML page to emulate code-server.

describe('Dashboard editor embed (orchestrator-forwarded) [integration]', () => {
  let dashServer: http.Server | null = null
  let orchServer: http.Server | null = null
  let editorServer: http.Server | null = null
  let base: string = 'http://127.0.0.1:0'
  const token = 'test-orch-token'

  beforeAll(async () => {
    process.env.ORCHESTRATOR_TOKEN = token
    // Create a stub editor backend on a random port that returns HTML
  editorServer = http.createServer((req, res) => {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html')
      res.end('<!doctype html><html><body>stub editor</body></html>')
    })
  await new Promise<void>((resolve) => editorServer!.listen(0, '127.0.0.1', () => resolve()))
  const eaddr = editorServer!.address() as any
    const editorPort = eaddr.port

    // Stub orchestrator that reports one agent and proxies /editor/proxy/:port to the stub editor
    orchServer = http.createServer((req, res) => {
      const u = new URL(req.url || '/', 'http://localhost')
      // auth for editor endpoints
      const authed = req.headers['x-auth-token'] === token || !/\/agents\/editor\//.test(u.pathname)
      if (!authed) {
        res.statusCode = 401
        res.setHeader('Content-Type', 'application/json')
        return res.end(JSON.stringify({ error: 'unauthorized' }))
      }
      if (u.pathname === '/agents') {
        res.setHeader('Content-Type', 'application/json')
        return res.end(
          JSON.stringify([
            { name: 'agent-stub', org: 'acme', status: 'idle', editorPort: editorPort, editorVia: 'orchestrator' },
          ])
        )
      }
      if (u.pathname === '/agents/editor/open' && req.method === 'POST') {
        res.setHeader('Content-Type', 'application/json')
        return res.end(JSON.stringify({ name: 'agent-stub', port: editorPort }))
      }
      if (u.pathname.startsWith('/editor/proxy/')) {
        // simulate the orchestrator's reverse-proxy: forward to local editorServer
        // We ignore the port segment and always target our editorServer
  const proxy = httpProxy.createProxyServer({})
        proxy.web(req, res, { target: `http://127.0.0.1:${editorPort}` })
        return
      }
      if (u.pathname === '/health') {
        res.setHeader('Content-Type', 'application/json')
        return res.end(JSON.stringify({ status: 'ok' }))
      }
      if (u.pathname === '/tasks') {
        res.setHeader('Content-Type', 'application/json')
        return res.end(JSON.stringify([]))
      }
      res.statusCode = 404
      res.end('not found')
    })
    await new Promise<void>((resolve) => orchServer!.listen(0, '127.0.0.1', () => resolve()))
    const oaddr = orchServer!.address() as any
    process.env.ORCHESTRATOR_URL = `http://127.0.0.1:${oaddr.port}`

    // Import app after env is configured and start dashboard
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
  if (editorServer) await new Promise((r) => editorServer!.close(() => r(null as any)))
  })

  it(
    'opens an editor and serves it via /embed/orchestrator/:port',
    async () => {
      const org = process.env.ORG || 'acme'
      // discover agent from state
      const s = await fetch(`${base}/api/state`)
      expect(s.status).toBe(200)
      const sb = await s.json()
      const agents: Array<any> = Array.isArray(sb.agents) ? sb.agents : []
      expect(agents.length).toBeGreaterThan(0)
      const agentName = agents[0]?.name || agents[0]?.Name || 'agent-stub'

      // request open
      const open = await fetch(`${base}/api/editor/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: agentName, org }),
      })
      expect(open.status).toBe(200)
      const opened = await open.json()
      const port = Number(opened?.port || 0)
      expect(port).toBeGreaterThan(0)

      // fetch embed
      const embed = await fetch(`${base}/embed/orchestrator/${encodeURIComponent(String(port))}/`)
      expect(embed.status).toBeGreaterThanOrEqual(200)
      expect(embed.status).toBeLessThan(400)
      const html = await embed.text()
      expect(html).toMatch(/stub editor/i)
    },
    60_000
  )
})
