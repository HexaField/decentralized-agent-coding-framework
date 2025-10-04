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
        try { reader.cancel() } catch {}
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

describe('SSE provision stream: error cases', () => {
  it('propagates orchestrator 4xx as stepError and done=false', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prov-sse-'))
    const bin = path.join(tmp, 'bin')
    const state = path.join(tmp, 'state')
    fs.mkdirSync(bin, { recursive: true })
    fs.mkdirSync(state, { recursive: true })
    // Fake kubectl to avoid noise if reached
    makeExe(bin, 'kubectl', '#!/usr/bin/env bash\nexit 0\n')
    makeExe(bin, 'tailscale', '#!/usr/bin/env bash\necho "{}"\nexit 0\n')
    const oldPath = process.env.PATH || ''
    process.env.PATH = `${bin}:${oldPath}`
    process.env.GUILDNET_STATE_DIR = state
    process.env.DASHBOARD_TOKEN = 'dash-secret'

    const orch = await startServer((req, res) => {
      if (req.method === 'POST' && req.url?.startsWith('/orgs/bootstrap')) {
        res.statusCode = 400
        res.setHeader('content-type', 'application/json')
        return res.end(JSON.stringify({ ok: false, error: 'invalid request' }))
      }
      res.statusCode = 404
      res.end('nf')
    })
    process.env.ORCHESTRATOR_URL = `http://127.0.0.1:${orch.port}`
    process.env.ORCHESTRATOR_TOKEN = 'orch-secret'

    const { default: app } = await import('./server.js')
    const dash = await startServer(app)
    try {
      const org = 'test-err'
      const url = `http://127.0.0.1:${dash.port}/api/orgs/${org}/provision/stream?token=dash-secret&cpNodes=10.0.0.10`
      const evs = await readSSE(url, { untilDone: true })
      const stepErr = evs.find((e) => e.event === 'stepError')
      expect(stepErr).toBeTruthy()
      const done = evs.find((e) => e.event === 'done')
      expect(done).toBeTruthy()
      expect(done ? JSON.parse(done.data).ok : true).toBe(false)
      // Error text from upstream should be present
      const err = evs.find((e) => e.event === 'error')
      expect(err?.data || '').toMatch(/invalid request/i)
    } finally {
      dash.server.close()
      orch.server.close()
      process.env.PATH = oldPath
    }
  }, 20_000)

  it('emits stepError when kubectl deploy fails and done=false', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prov-sse-'))
    const bin = path.join(tmp, 'bin')
    const state = path.join(tmp, 'state')
    fs.mkdirSync(bin, { recursive: true })
    fs.mkdirSync(state, { recursive: true })
    // kubectl returns error on apply
    makeExe(
      bin,
      'kubectl',
      '#!/usr/bin/env bash\n# fail kubectl apply\nfor arg in "$@"; do if [[ "$arg" == "apply" ]]; then echo "apply failed"; exit 1; fi; done; exit 0\n'
    )
    makeExe(bin, 'tailscale', '#!/usr/bin/env bash\necho "{}"\nexit 0\n')
    const oldPath = process.env.PATH || ''
    process.env.PATH = `${bin}:${oldPath}`
    process.env.GUILDNET_STATE_DIR = state
    process.env.DASHBOARD_TOKEN = 'dash-secret'

    // Ensure kubeconfig exists so we reach deploy step
    const org = 'test-fail'
    const kubeDir = path.join(state, 'kube')
    fs.mkdirSync(kubeDir, { recursive: true })
    fs.writeFileSync(path.join(kubeDir, `${org}.config`), 'apiVersion: v1\nclusters: []\n')

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
      const evs = await readSSE(url, { untilDone: true })
      const stepErr = evs.find((e) => e.event === 'stepError' && /Deploy orchestrator/.test(e.data))
      expect(stepErr).toBeTruthy()
      const done = evs.find((e) => e.event === 'done')
      expect(done).toBeTruthy()
      expect(done ? JSON.parse(done.data).ok : true).toBe(false)
    } finally {
      dash.server.close()
      orch.server.close()
      process.env.PATH = oldPath
    }
  }, 20_000)
})
