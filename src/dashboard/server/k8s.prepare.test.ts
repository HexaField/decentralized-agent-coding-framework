import http from 'http'
import request from 'supertest'

describe('dashboard server /api/k8s/prepare proxy', () => {
  let dash: http.Server | null = null
  let orch: http.Server | null = null

  beforeAll(async () => {
    // stub orchestrator that echoes back org/namespace
    orch = http.createServer((req, res) => {
      const u = new URL(req.url || '/', 'http://localhost')
      if (u.pathname === '/k8s/prepare' && req.method === 'POST') {
        let body = ''
        req.on('data', (d) => (body += String(d)))
        req.on('end', () => {
          let j: any = {}
          try { j = JSON.parse(body || '{}') } catch {}
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true, org: j.org || 'acme', namespace: j.namespace || 'mvp-agents' }))
        })
        return
      }
      res.statusCode = 404
      res.end('not found')
    })
    await new Promise<void>((r) => orch!.listen(0, '127.0.0.1', () => r()))
    const addr = orch!.address() as any
    process.env.ORCHESTRATOR_URL = `http://127.0.0.1:${addr.port}`
    process.env.DASHBOARD_TOKEN = 't'
    const appMod = await import('./index.js')
    dash = http.createServer(appMod.default)
    await new Promise<void>((r) => dash!.listen(0, '127.0.0.1', () => r()))
  })

  afterAll(async () => {
    if (dash) await new Promise((r) => dash!.close(() => r(null as any)))
    if (orch) await new Promise((r) => orch!.close(() => r(null as any)))
  })

  it('proxies to orchestrator and returns JSON', async () => {
    const addr = dash!.address() as any
    const base = `http://127.0.0.1:${addr.port}`
    const res = await request(base)
      .post('/api/k8s/prepare')
      .set('X-Auth-Token', 't')
      .send({ org: 'acme' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('ok', true)
    expect(res.body).toHaveProperty('namespace')
  })
})
