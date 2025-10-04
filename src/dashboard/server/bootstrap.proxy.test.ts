import http from 'http'

// This test stands up a stub orchestrator and validates that the dashboard's
// POST /api/orgs/:name/bootstrap forwards correctly and returns upstream body/status.

function startServer(
  handler: http.RequestListener
): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve({ server, port })
    })
  })
}

async function json(res: Response) {
  const txt = await res.text()
  try {
    return JSON.parse(txt)
  } catch {
    return { text: txt } as any
  }
}

describe('dashboard bootstrap proxy', () => {
  let orch: http.Server | null = null
  let dash: http.Server | null = null
  let dashPort = 0

  afterEach(async () => {
    if (dash) await new Promise((r) => dash!.close(() => r(null)))
    if (orch) await new Promise((r) => orch!.close(() => r(null)))
    orch = dash = null
  })

  it('forwards to orchestrator with X-Auth-Token and returns upstream payload', async () => {
    // Arrange: stub orchestrator that verifies token and body shape
    const orchStarted = await startServer((req, res) => {
      if (req.method === 'POST' && req.url?.startsWith('/orgs/bootstrap')) {
        const tok = req.headers['x-auth-token']
        if (tok !== 'orch-secret') {
          res.statusCode = 401
          res.setHeader('content-type', 'application/json')
          return res.end(JSON.stringify({ ok: false, error: 'unauthorized orchestrator' }))
        }
        const chunks: Buffer[] = []
        req.on('data', (c) => chunks.push(Buffer.from(c)))
        req.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            if (!body || !Array.isArray(body.cpNodes) || !body.org) throw new Error('bad body')
            res.statusCode = 200
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ ok: true, kubeconfig: `/state/kube/${body.org}.config` }))
          } catch (e: any) {
            res.statusCode = 400
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }))
          }
        })
        return
      }
      res.statusCode = 404
      res.end('not found')
    })
    orch = orchStarted.server
    const orchUrl = `http://127.0.0.1:${orchStarted.port}`

    // Stand up dashboard bound to that orchestrator. Set env BEFORE importing app.
    process.env.ORCHESTRATOR_URL = orchUrl
    process.env.ORCHESTRATOR_TOKEN = 'orch-secret'
    process.env.DASHBOARD_TOKEN = 'dash-secret'
    const { default: app } = await import('./server.js')
    const dashStarted = await startServer(app)
    dash = dashStarted.server
    dashPort = dashStarted.port

    // Act
    const org = 'test1'
    const res = await fetch(`http://127.0.0.1:${dashPort}/api/orgs/${org}/bootstrap`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-auth-token': 'dash-secret' },
      body: JSON.stringify({ cpNodes: ['10.0.0.10'], workerNodes: [] }),
    })
    const body = await json(res)

    // Assert
    expect(res.status).toBe(200)
    expect(body && body.ok).toBe(true)
    expect(typeof body.kubeconfig).toBe('string')
  })

  it('surfaces orchestrator auth errors as 4xx (not 502)', async () => {
    const orchStarted = await startServer((req, res) => {
      if (req.method === 'POST' && req.url?.startsWith('/orgs/bootstrap')) {
        res.statusCode = 401
        res.setHeader('content-type', 'application/json')
        return res.end(JSON.stringify({ ok: false, error: 'unauthorized orchestrator' }))
      }
      res.statusCode = 404
      res.end('not found')
    })
    orch = orchStarted.server
    const orchUrl = `http://127.0.0.1:${orchStarted.port}`

    process.env.ORCHESTRATOR_URL = orchUrl
    process.env.ORCHESTRATOR_TOKEN = 'wrong' // token irrelevant here
    process.env.DASHBOARD_TOKEN = 'dash-secret'
    const { default: app } = await import('./server.js')
    const dashStarted = await startServer(app)
    dash = dashStarted.server
    dashPort = dashStarted.port

    const org = 'test1'
    const res = await fetch(`http://127.0.0.1:${dashPort}/api/orgs/${org}/bootstrap`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-auth-token': 'dash-secret' },
      body: JSON.stringify({ cpNodes: ['10.0.0.10'], workerNodes: [] }),
    })
    // should propagate as a client error (4xx), not a generic 502
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    const b = await json(res)
    expect(b && b.ok === false).toBeTruthy()
  })
})
