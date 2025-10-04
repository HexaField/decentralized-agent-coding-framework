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

async function readSSE(url: string, opts?: { untilDone?: boolean }) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
  const reader = (res.body as any).getReader()
  let buf = ''
  const events: Array<{ event: string; data: string }> = []
  let done = false
  while (!done) {
    const { value, done: streamDone } = await reader.read()
    if (streamDone) break
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
      if (opts?.untilDone && ev === 'done') {
        done = true
        try {
          reader.cancel()
        } catch {}
        break
      }
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

describe('SSE provision stream', () => {
  it('succeeds when cpNodes are provided (skips discovery) and deploys via fake kubectl', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prov-sse-'))
    const bin = path.join(tmp, 'bin')
    const state = path.join(tmp, 'state')
    fs.mkdirSync(bin, { recursive: true })
    fs.mkdirSync(state, { recursive: true })
    // Fake kubectl: always succeed
    makeExe(
      bin,
      'kubectl',
      '#!/usr/bin/env bash\n# fake kubectl\necho "fake kubectl $@" >&2\nexit 0\n'
    )
    // Optional: fake tailscale (not strictly required when cpNodes provided)
    makeExe(
      bin,
      'tailscale',
      '#!/usr/bin/env bash\n# fake tailscale\nif [[ "$1" == "status" ]]; then echo "{}"; else echo "tailscale $@"; fi\nexit 0\n'
    )

    // Isolate PATH and state base for dashboard
    const oldPath = process.env.PATH || ''
    process.env.PATH = `${bin}:${oldPath}`
    process.env.GUILDNET_STATE_DIR = state
    process.env.DASHBOARD_TOKEN = 'dash-secret'

    // Prepare kubeconfig file expected by deploy step
    const org = 'test1'
    const kubeDir = path.join(state, 'kube')
    fs.mkdirSync(kubeDir, { recursive: true })
    fs.writeFileSync(path.join(kubeDir, `${org}.config`), 'apiVersion: v1\nclusters: []\n')

    // Mock orchestrator: validate token and body, return ok
    const orch = await startServer((req, res) => {
      if (req.method === 'POST' && req.url?.startsWith('/orgs/bootstrap')) {
        if (req.headers['x-auth-token'] !== 'orch-secret') {
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
      res.end('nf')
    })

    process.env.ORCHESTRATOR_URL = `http://127.0.0.1:${orch.port}`
    process.env.ORCHESTRATOR_TOKEN = 'orch-secret'

    // Start dashboard server
    const { default: app } = await import('./server.js')
    const dash = await startServer(app)

    try {
      const url = `http://127.0.0.1:${dash.port}/api/orgs/${org}/provision/stream?token=dash-secret&cpNodes=10.0.0.10`
      const evs = await readSSE(url, { untilDone: true })
      const done = evs.find((e) => e.event === 'done')
      expect(done).toBeTruthy()
      const ok = done ? JSON.parse(done.data).ok : false
      expect(ok).toBe(true)
      // Ensure we did not fail on discovery and did perform bootstrap step
      const errs = evs.filter((e) => e.event === 'error')
      expect(errs.length).toBe(0)
      const stepDone = evs.find(
        (e) => e.event === 'stepDone' && /Talos bootstrap via orchestrator/.test(e.data)
      )
      expect(stepDone).toBeTruthy()
    } finally {
      dash.server.close()
      orch.server.close()
      process.env.PATH = oldPath
    }
  }, 30_000)

  it('emits an error when no cpNodes discovered or provided', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prov-sse-'))
    const bin = path.join(tmp, 'bin')
    fs.mkdirSync(bin, { recursive: true })
    // No tailscale present to force discovery failure
    const oldPath = process.env.PATH || ''
    process.env.PATH = `${bin}:${oldPath}`
    process.env.DASHBOARD_TOKEN = 'dash-secret'

    // Start dashboard server with no orchestrator (will fail before calling it)
    const { default: app } = await import('./server.js')
    const dash = await startServer(app)
    try {
      const org = 'test2'
      const url = `http://127.0.0.1:${dash.port}/api/orgs/${org}/provision/stream?token=dash-secret`
      const evs = await readSSE(url, { untilDone: true })
      const err = evs.find((e) => e.event === 'error')
      expect(err).toBeTruthy()
      expect(err?.data || '').toMatch(/No control-plane nodes discovered/)
      const done = evs.find((e) => e.event === 'done')
      expect(done).toBeTruthy()
      expect(done ? JSON.parse(done.data).ok : true).toBe(false)
    } finally {
      dash.server.close()
      process.env.PATH = oldPath
    }
  }, 20_000)
})
