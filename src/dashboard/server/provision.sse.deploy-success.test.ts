import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function startServer(
  handler: http.RequestListener
): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr && 'port' in addr ? (addr as any).port : 0
      resolve({ server, port })
    })
  })
}

async function readSSE(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
  const reader = (res.body as any).getReader()
  const events: Array<{ event: string; data: string }> = []
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += Buffer.from(value).toString('utf8')
    let idx
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const chunk = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      const lines = chunk.split(/\r?\n/)
      let ev = 'message'
      let data = ''
      for (const ln of lines) {
        if (ln.startsWith('event:')) ev = ln.slice(6).trim()
        if (ln.startsWith('data:')) data = ln.slice(5).trim()
      }
      events.push({ event: ev, data })
      if (ev === 'done') return events
    }
  }
  return events
}

function makeExe(dir: string, name: string, content: string) {
  const p = path.join(dir, name)
  fs.writeFileSync(p, content)
  fs.chmodSync(p, 0o755)
  return p
}

describe('SSE provision stream: deploy success', () => {
  it('emits stepDone for deploy and finishes ok', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prov-sse-'))
    const bin = path.join(tmp, 'bin')
    const state = path.join(tmp, 'state')
    fs.mkdirSync(bin, { recursive: true })
    fs.mkdirSync(state, { recursive: true })
    // kubectl apply and rollout succeed
    makeExe(
      bin,
      'kubectl',
      '#!/usr/bin/env bash\n# succeed kubectl apply/rollout\necho "kubectl $@" >&2\nexit 0\n'
    )
    const oldPath = process.env.PATH || ''
    process.env.PATH = `${bin}:${oldPath}`
    process.env.GUILDNET_STATE_DIR = state
    process.env.DASHBOARD_TOKEN = 'dash-secret'

    const org = 'suc'
    const kubeDir = path.join(state, 'kube')
    fs.mkdirSync(kubeDir, { recursive: true })
    fs.writeFileSync(path.join(kubeDir, `${org}.config`), 'apiVersion: v1\nkind: Config\n')

    const orch = await startServer((req, res) => {
      if (req.method === 'POST' && req.url?.startsWith('/orgs/bootstrap')) {
        res.statusCode = 200
        res.setHeader('content-type', 'application/json')
        return res.end(JSON.stringify({ ok: true, kubeconfig: `/state/kube/${org}.config` }))
      }
      res.statusCode = 404
      res.end('nf')
    })
    process.env.ORCHESTRATOR_URL = `http://127.0.0.1:${orch.port}`
    process.env.ORCHESTRATOR_TOKEN = 'orch-secret'

    const { default: app } = await import('./server.js')
    const dash = await startServer(app)
    try {
      const url = `http://127.0.0.1:${dash.port}/api/orgs/${org}/provision/stream?token=dash-secret&cpNodes=10.0.0.10`
      const evs = await readSSE(url)
      const d = evs.find((e) => e.event === 'done')
      expect(d).toBeTruthy()
      expect(d ? JSON.parse(d.data).ok : false).toBe(true)
      const depDone = evs.find(
        (e) => e.event === 'stepDone' && /Deploy orchestrator to cluster/.test(e.data)
      )
      expect(depDone).toBeTruthy()
    } finally {
      dash.server.close()
      orch.server.close()
      process.env.PATH = oldPath
    }
  }, 20_000)
})
