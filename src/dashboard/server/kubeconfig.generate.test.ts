import { createServer } from 'http'
import { once } from 'events'
import { AddressInfo } from 'net'
import supertest from 'supertest'

let app: any

function makeOrchStub() {
  const calls: any[] = []
  const srv = createServer((req, res) => {
    calls.push({ method: req.method, url: req.url })
    if (req.url === '/kubeconfig/generate' && req.method === 'POST') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, path: '/state/kube/acme.config' }))
      return
    }
    res.statusCode = 404
    res.end('not found')
  })
  return { srv, calls }
}

describe('dashboard server /api/orgs/:name/kubeconfig/generate proxy', () => {
  it('MUST proxy to orchestrator and return its response', async () => {
    const orch = makeOrchStub()
    orch.srv.listen(0)
    await once(orch.srv, 'listening')
    const port = (orch.srv.address() as AddressInfo).port
    ;(process as any).env = {
      ...process.env,
      ORCHESTRATOR_URL: `http://127.0.0.1:${port}`,
      ORCHESTRATOR_TOKEN: 't1',
      DASHBOARD_TOKEN: 'd1',
    }
    ;({ default: app } = await import('./index.js'))

    const r = await supertest(app)
      .post('/api/orgs/acme/kubeconfig/generate')
      .set('X-Auth-Token', 'd1')
      .send({ endpoint: '10.0.0.10' })
      .expect(200)

    expect(r.body.ok).toBe(true)
    expect(r.body.path).toBe('/state/kube/acme.config')

    orch.srv.close()
  })
})
