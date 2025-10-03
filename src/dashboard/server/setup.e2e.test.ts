import 'dotenv/config'
import http from 'http'
import app from './index.js'

// These tests perform real calls to tailscale/headscale. They require Docker and tailscale CLI.
// They are slow and potentially stateful; run them explicitly.
// Pre-reqs:
// - Docker available on PATH
// - tailscale CLI installed
// - Will spin up local headscale if needed via server API
// - Tests use TEST_FAST_SETUP=1 to skip heavy k8s operator steps

const DASHBOARD_TOKEN = process.env.DASHBOARD_TOKEN || 'dashboard-secret'

async function readSSE(url: string, opts?: RequestInit) {
  const res = await fetch(url, Object.assign({ method: 'GET' }, opts))
  if (!res.ok) throw new Error(`SSE ${url} ${res.status}`)
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const events: Array<{ event: string; data: string }> = []
  const deadline = Date.now() + 120_000 // allow up to 2 minutes for slow steps
  const readWithTimeout = (ms: number) =>
    new Promise<{ value?: Uint8Array; done?: boolean; timeout?: boolean }>((resolve) => {
      let settled = false
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          resolve({ timeout: true })
        }
      }, ms)
      reader.read().then(
        (r) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve(r as any)
        },
        () => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve({ done: true })
        }
      )
    })
  while (Date.now() < deadline) {
    const { value, done, timeout } = await readWithTimeout(45_000) // stop waiting if no new data
    if (timeout) break
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split(/\n\n/)
    buffer = parts.pop() || ''
    for (const part of parts) {
      const evMatch = part.match(/event:\s*(.+)/)
      const dataMatch = part.match(/data:\s*([\s\S]*)/) // data may span lines
      if (evMatch && dataMatch) {
        events.push({ event: evMatch[1].trim(), data: dataMatch[1] })
        // verbose log to help reproduce UI failures
        console.log(`[sse] ${evMatch[1].trim()} ${dataMatch[1].slice(0, 200)}`)
      }
    }
    // Stop if done event received
    if (events.find((e) => e.event === 'done')) break
  }
  return events
}

async function tailscaleConnected() {
  try {
    const { execSync } = await import('child_process')
    const out = execSync('tailscale status --json', {
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString()
    try {
      const j = JSON.parse(out)
      const selfOk = Boolean(j && j.Self && (j.Self.TailAddr || j.Self.HostName))
      const backendOk = String(j && j.BackendState) === 'Running'
      const tailnetOk = Boolean((j && (j.Tailnet || j.CurrentTailnet)) || false)
      return selfOk || backendOk || tailnetOk
    } catch {
      return /relay|wgpeer|hostinfo/i.test(out)
    }
  } catch {
    return false
  }
}

describe('Setup flows (real tailscale/headscale): MUST succeed when properly configured', () => {
  const run = process.env.RUN_TAILSCALE_E2E === '1'
  let server: http.Server | null = null
  let base: string = 'http://127.0.0.1:0'
  beforeAll(async () => {
    process.env.TEST_FAST_SETUP = '1'
    // Mirror UI/dev env so bootstrap picks the same dynamic port behavior and dev flags
    process.env.UI_DEV = '1'
    // Make port selection deterministic between UI and test; match UI symptoms where 8080 may be in use
    process.env.HEADSCALE_BIND_IP = process.env.HEADSCALE_BIND_IP || '127.0.0.1'
    process.env.HEADSCALE_PORT = process.env.HEADSCALE_PORT || '8081'
    await new Promise<void>((resolve) => {
      server = http.createServer(app)
      server!.listen(0, '127.0.0.1', () => resolve())
    })
    const addr = server!.address() as any
    base = `http://127.0.0.1:${addr.port}`
  })
  afterAll(async () => {
    if (server) await new Promise((r) => server!.close(() => r(null as any)))
  })

  it(
    run ? 'MUST join existing network flow' : 'join existing network flow (skipped)',
    async () => {
      if (!run) return
      const hs = process.env.HEADSCALE_URL
      const key = process.env.TS_AUTHKEY
      const host =
        process.env.TS_HOSTNAME || `orchestrator-${Math.random().toString(36).slice(2, 8)}`
      if (!hs || !key) return

      const qs = new URLSearchParams({ flow: 'connect', mode: 'auto', token: DASHBOARD_TOKEN })
      if (hs) qs.set('HEADSCALE_URL', hs)
      if (key) qs.set('TS_AUTHKEY', key)
      if (host) qs.set('TS_HOSTNAME', host)

      const url = `${base}/api/setup/stream?${qs.toString()}`
      const events = await readSSE(url, { cache: 'no-store' })
      const done = events.find((e) => e.event === 'done')
      expect(done).toBeTruthy()
      const ok = (() => {
        try {
          return JSON.parse(done!.data).ok
        } catch {
          return false
        }
      })()
      expect(ok).toBe(true)

      // verify connected
      const connected = await tailscaleConnected()
      expect(connected).toBe(true)
    },
    180_000
  )

  it('MUST create and list an org via orgs API', async () => {
    const name = `e2e-${Math.random().toString(36).slice(2, 8)}`
    // Create
    const createRes = await fetch(`${base}/api/orgs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Token': DASHBOARD_TOKEN,
      },
      body: JSON.stringify({ name }),
    })
    const create = await createRes.json()
    // If already exists (rare due to random), tweak name and retry once
    if (!createRes.ok && create && create.error === 'exists') {
      const name2 = `${name}-x`
      const r2 = await fetch(`${base}/api/orgs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': DASHBOARD_TOKEN,
        },
        body: JSON.stringify({ name: name2 }),
      })
      expect(r2.ok).toBe(true)
    } else {
      expect(createRes.ok).toBe(true)
      expect(create && create.ok).toBeTruthy()
      expect(create.org && create.org.name).toBe(name)
    }

    // List and verify
    const list = await fetch(`${base}/api/orgs`).then((x) => x.json())
    expect(Array.isArray(list.orgs)).toBe(true)
    const found = (list.orgs || []).find((o: any) => o && o.name && o.name.startsWith(name))
    expect(Boolean(found)).toBe(true)

    // Cleanup: delete the created org
    if (found && found.id) {
      const del = await fetch(`${base}/api/orgs/${found.id}`, {
        method: 'DELETE',
        headers: { 'X-Auth-Token': DASHBOARD_TOKEN },
      })
      expect(del.ok).toBe(true)
    }
  })

  it(
    run
      ? 'create new network flow (local headscale) succeeds'
      : 'create new network flow (skipped)',
    async () => {
      if (!run) return
      const host =
        process.env.TS_HOSTNAME || `orchestrator-${Math.random().toString(36).slice(2, 8)}`
      // Create an org and pass it to setup so kubeconfig names are deterministic
      const org = `e2e-${Math.random().toString(36).slice(2, 8)}`
      {
        const r = await fetch(`${base}/api/orgs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Auth-Token': DASHBOARD_TOKEN,
          },
          body: JSON.stringify({ name: org }),
        })
        expect(r.ok).toBe(true)
      }
      const qs = new URLSearchParams({ flow: 'create', mode: 'local', token: DASHBOARD_TOKEN })
      qs.set('TS_HOSTNAME', host)
      qs.set('org', org)
      const url = `${base}/api/setup/stream?${qs.toString()}`
      const events = await readSSE(url, { cache: 'no-store' })
      const done = events.find((e) => e.event === 'done')
      expect(done).toBeTruthy()
      const ok = (() => {
        try {
          return JSON.parse(done!.data).ok
        } catch {
          return false
        }
      })()
      expect(ok).toBe(true)
      // verify kubeconfig exists in home kube dir with expected context when full setup runs
      const path = await import('node:path')
      const fs = await import('node:fs')
      const os = await import('node:os')
      const homeKcfg = path.resolve(os.homedir(), '.kube', `${org}.config`)
      if (process.env.TEST_FAST_SETUP !== '1') {
        expect(fs.existsSync(homeKcfg)).toBe(true)
        const txt = fs.readFileSync(homeKcfg, 'utf8')
        expect(txt).toMatch(new RegExp(`current-context:\\s*${org}`))
        expect(txt).toMatch(new RegExp(`name:\\s*${org}`))
      }

      // verify connected
      const connected = await tailscaleConnected()
      expect(connected).toBe(true)
    },
    240_000
  )
})

// RUN_TAILSCALE_E2E=1 SETUP_ALLOW_INTERACTIVE=0 DASHBOARD_TOKEN=dashboard-secret npm run test:e2e
