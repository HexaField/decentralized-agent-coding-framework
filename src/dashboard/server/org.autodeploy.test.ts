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

describe('org creation triggers auto-deploy', () => {
  it('invokes kubectl apply/rollout when kubeconfig exists', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'org-autodeploy-'))
    const bin = path.join(tmp, 'bin')
    const state = path.join(tmp, 'state')
    fs.mkdirSync(bin, { recursive: true })
    fs.mkdirSync(state, { recursive: true })
    const calls = path.join(tmp, 'calls.txt')
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

    const { default: app } = await import('./server.js')
    const dash = await startServer(app)
    try {
      const org = 'auto1'
      // Pre-provision kubeconfig so background task detects it immediately
      const kubeDir = path.join(state, 'kube')
      fs.mkdirSync(kubeDir, { recursive: true })
      fs.writeFileSync(path.join(kubeDir, `${org}.config`), 'apiVersion: v1\nkind: Config\n')

      const r = await fetch(`http://127.0.0.1:${dash.port}/api/orgs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': 'dash-secret' },
        body: JSON.stringify({ name: org }),
      })
      expect(r.ok).toBe(true)
      // Wait briefly for background auto-deploy to fire
      const deadline = Date.now() + 3000
      let seenApply = false
      while (Date.now() < deadline) {
        if (fs.existsSync(calls)) {
          const content = fs.readFileSync(calls, 'utf8')
          if (/\sapply\s/.test(content) && /\srollout\sstatus\s/.test(content)) {
            seenApply = true
            break
          }
        }
        await new Promise((r) => setTimeout(r, 100))
      }
      expect(seenApply).toBe(true)
    } finally {
      dash.server.close()
      process.env.PATH = oldPath
    }
  })

  it('does not invoke kubectl when kubeconfig is missing (defers)', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'org-autodeploy-'))
    const bin = path.join(tmp, 'bin')
    const state = path.join(tmp, 'state')
    fs.mkdirSync(bin, { recursive: true })
    fs.mkdirSync(state, { recursive: true })
    const calls = path.join(tmp, 'calls.txt')
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
    delete process.env.AUTO_IMPORT_KUBECONFIG_ON_CREATE

    const { default: app } = await import('./server.js')
    const dash = await startServer(app)
    try {
      const org = 'auto-miss'
      // Do NOT create kubeconfig; background should wait and not call kubectl immediately
      const r = await fetch(`http://127.0.0.1:${dash.port}/api/orgs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': 'dash-secret' },
        body: JSON.stringify({ name: org }),
      })
      expect(r.ok).toBe(true)
      // Wait a short time and ensure kubectl was not called yet
      await new Promise((rr) => setTimeout(rr, 2200))
      const exists = fs.existsSync(calls)
      const text = exists ? fs.readFileSync(calls, 'utf8') : ''
      expect(text).toBe('')
    } finally {
      dash.server.close()
      process.env.PATH = oldPath
    }
  })
})
