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

function makeExe(dir: string, name: string, content: string) {
  const p = path.join(dir, name)
  fs.writeFileSync(p, content)
  fs.chmodSync(p, 0o755)
  return p
}

describe('kubectl global args rewrite for kubeconfig server', () => {
  it('rewrites 0.0.0.0:PORT to 127.0.0.1 and adds --insecure-skip-tls-verify', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kubectl-rewrite-'))
    const bin = path.join(tmp, 'bin')
    const state = path.join(tmp, 'state')
    fs.mkdirSync(bin, { recursive: true })
    fs.mkdirSync(state, { recursive: true })
    const calls = path.join(tmp, 'calls.txt')
    // Fake kubectl that records args and always succeeds
    makeExe(
      bin,
      'kubectl',
      `#!/usr/bin/env bash
echo "$@" >> ${calls}
exit 0
`
    )
    const oldPath = process.env.PATH || ''
    process.env.PATH = `${bin}:${oldPath}`
    process.env.GUILDNET_STATE_DIR = state
    process.env.DASHBOARD_TOKEN = 'dash-secret'

    // Prepare kubeconfig with server 0.0.0.0
    const org = 'rw1'
    const kubeDir = path.join(state, 'kube')
    fs.mkdirSync(kubeDir, { recursive: true })
    fs.writeFileSync(
      path.join(kubeDir, `${org}.config`),
      'apiVersion: v1\nkind: Config\nclusters:\n- cluster:\n    server: https://0.0.0.0:6443\n  name: c1\ncontexts: []\n'
    )

    // Minimal orchestrator-independent server
    const { default: app } = await import('./server.js')
    const dash = await startServer(app)
    try {
      const res = await fetch(`http://127.0.0.1:${dash.port}/api/k8s/orchestrator/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': 'dash-secret' },
        body: JSON.stringify({ org }),
      })
      const j = await res.json()
      expect(res.ok).toBe(true)
      expect(j && j.ok).toBe(true)

      const log = fs.readFileSync(calls, 'utf8')
      // Find apply invocation line
      const line = log
        .split(/\r?\n/)
        .find((l) => /\sapply\s/.test(l) && /-f\s/.test(l)) || ''
      expect(line).toContain('--server')
      expect(line).toContain('https://127.0.0.1:6443')
      expect(line).toContain('--insecure-skip-tls-verify')
    } finally {
      dash.server.close()
      process.env.PATH = oldPath
    }
  })

  it('inside container: rewrites 127.0.0.1 to host.docker.internal and adds --insecure-skip-tls-verify', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kubectl-rewrite-'))
    const bin = path.join(tmp, 'bin')
    const state = path.join(tmp, 'state')
    fs.mkdirSync(bin, { recursive: true })
    fs.mkdirSync(state, { recursive: true })
    const calls = path.join(tmp, 'calls2.txt')
    // Fake kubectl that records args and always succeeds
    makeExe(
      bin,
      'kubectl',
      `#!/usr/bin/env bash
echo "$@" >> ${calls}
exit 0
`
    )
    const oldPath = process.env.PATH || ''
    process.env.PATH = `${bin}:${oldPath}`
    process.env.GUILDNET_STATE_DIR = state
    process.env.DASHBOARD_TOKEN = 'dash-secret'
    process.env.DASHBOARD_IN_CONTAINER = '1'

    // Prepare kubeconfig with server 127.0.0.1
    const org = 'rw2'
    const kubeDir = path.join(state, 'kube')
    fs.mkdirSync(kubeDir, { recursive: true })
    fs.writeFileSync(
      path.join(kubeDir, `${org}.config`),
      'apiVersion: v1\nkind: Config\nclusters:\n- cluster:\n    server: https://127.0.0.1:6443\n  name: c1\ncontexts: []\n'
    )

    const { default: app } = await import('./server.js')
    const dash = await startServer(app)
    try {
      const res = await fetch(`http://127.0.0.1:${dash.port}/api/k8s/orchestrator/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': 'dash-secret' },
        body: JSON.stringify({ org }),
      })
      const j = await res.json()
      expect(res.ok).toBe(true)
      expect(j && j.ok).toBe(true)

      const log = fs.readFileSync(calls, 'utf8')
      const line = log
        .split(/\r?\n/)
        .find((l) => /\sapply\s/.test(l) && /-f\s/.test(l)) || ''
      expect(line).toContain('--server')
      expect(line).toContain('https://host.docker.internal:6443')
      expect(line).toContain('--insecure-skip-tls-verify')
    } finally {
      dash.server.close()
      process.env.PATH = oldPath
      delete process.env.DASHBOARD_IN_CONTAINER
    }
  })
})
