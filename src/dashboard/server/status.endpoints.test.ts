import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'

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

describe('Org config status endpoints', () => {
  it('reports exists/path for kubeconfig and talosconfig under state dir', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'status-'))
    const state = path.join(tmp, 'state')
    fs.mkdirSync(state, { recursive: true })
    process.env.GUILDNET_STATE_DIR = state
    const org = 's1'

    const kubeDir = path.join(state, 'kube')
    fs.mkdirSync(kubeDir, { recursive: true })
    const kubePath = path.join(kubeDir, `${org}.config`)
    fs.writeFileSync(
      kubePath,
      'apiVersion: v1\nkind: Config\nclusters:\n- cluster: { server: https://10.0.0.1:6443 }\n'
    )

    const talosDir = path.join(state, 'talos')
    fs.mkdirSync(talosDir, { recursive: true })
    const talosPath = path.join(talosDir, `${org}.talosconfig`)
    fs.writeFileSync(talosPath, 'context: default\ncontexts:\n- name: default\n')

    const { default: app } = await import('./server.js')
    const srv = await startServer(app)
    try {
      const k = await fetch(
        `http://127.0.0.1:${srv.port}/api/orgs/${org}/kubeconfig/status`
      ).then((r) => r.json())
      expect(k.ok).toBe(true)
      expect(k.exists).toBe(true)
      expect(typeof k.path).toBe('string')
      expect(k.path).toBe(kubePath)

      const t = await fetch(
        `http://127.0.0.1:${srv.port}/api/orgs/${org}/talosconfig/status`
      ).then((r) => r.json())
      expect(t.ok).toBe(true)
      expect(t.exists).toBe(true)
      expect(typeof t.path).toBe('string')
      expect(t.path).toBe(talosPath)
    } finally {
      srv.server.close()
    }
  })
})
