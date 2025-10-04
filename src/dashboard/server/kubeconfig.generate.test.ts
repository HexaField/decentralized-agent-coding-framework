import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function startServer(handler: http.RequestListener): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr && 'port' in addr ? (addr as any).port : 0
      resolve({ server, port })
    })
  })
}

describe('kubeconfig generate precheck', () => {
  it('rejects when talosconfig missing or invalid; accepts when present and proxies upstream', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kcgen-'))
    const state = path.join(tmp, 'state')
    fs.mkdirSync(state, { recursive: true })
    process.env.GUILDNET_STATE_DIR = state
    process.env.DASHBOARD_TOKEN = 'dash-secret'

    const { default: app } = await import('./server.js')
    const srv = await startServer(app)
    const org = 'kx'
    try {
      // Missing talosconfig -> 400
      let r = await fetch(`http://127.0.0.1:${srv.port}/api/orgs/${org}/kubeconfig/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-auth-token': 'dash-secret' },
        body: JSON.stringify({ endpoint: '10.0.0.10' }),
      })
      expect(r.status).toBe(400)
      const b1 = await r.json()
      expect(b1.ok).toBe(false)
      expect(String(b1.error || '')).toMatch(/talosconfig not found/i)

      // Create valid-ish talosconfig
      const tdir = path.join(state, 'talos')
      fs.mkdirSync(tdir, { recursive: true })
      fs.writeFileSync(path.join(tdir, `${org}.talosconfig`), 'contexts:\n- name: default\n')

      // Mock orchestrator and set env
      const orch = await startServer((req, res) => {
        if (req.method === 'POST' && req.url?.startsWith('/kubeconfig/generate')) {
          res.statusCode = 200
          res.setHeader('content-type', 'application/json')
          return res.end(JSON.stringify({ ok: true, path: `/state/kube/${org}.config` }))
        }
        res.statusCode = 404
        res.end('nf')
      })
      process.env.ORCHESTRATOR_URL = `http://127.0.0.1:${orch.port}`
      process.env.ORCHESTRATOR_TOKEN = 'orch-secret'

      r = await fetch(`http://127.0.0.1:${srv.port}/api/orgs/${org}/kubeconfig/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-auth-token': 'dash-secret' },
        body: JSON.stringify({ endpoint: '10.0.0.10' }),
      })
      expect(r.status).toBe(200)
      const b2 = await r.json()
      expect(b2.ok).toBe(true)

      // Cleanup mock orchestrator
      orch.server.close()
    } finally {
      srv.server.close()
    }
  })
})
