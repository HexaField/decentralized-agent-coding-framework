// Use external running dashboard via *_TEST envs from e2e.env. Do not spin up local server.
import {
  DASHBOARD_URL as base,
  DASHBOARD_TOKEN,
  HEADSCALE_URL,
  TS_AUTHKEY,
  TS_HOSTNAME,
  RUN_TAILSCALE_E2E,
  TEST_FAST_SETUP,
} from './e2e.env.js'

// These tests perform real calls to tailscale/headscale. They require Docker and tailscale CLI.
// They are slow and potentially stateful; run them explicitly.
// Pre-reqs:
// - Docker available on PATH
// - tailscale CLI installed
// - Will spin up local headscale if needed via server API
// - Tests use TEST_FAST_SETUP=1 to skip heavy k8s operator steps

// Ensure fast setup default reflects env helper
if (TEST_FAST_SETUP) process.env.TEST_FAST_SETUP = String(TEST_FAST_SETUP)

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

// tailscaleConnected helper removed to keep suite lean

const RUN = Boolean(
  RUN_TAILSCALE_E2E && (process.env.DASHBOARD_URL || process.env.DASHBOARD_URL_TEST)
)
const suite = RUN ? describe : describe.skip

suite('Setup flows (real tailscale/headscale): MUST succeed when properly configured', () => {
  beforeAll(async () => {
    // Accept self-signed TLS for local dev
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0'
    // Quick health probe for helpful error
    const h = await fetch(`${base}/api/health`).catch(() => null as any)
    if (!h || h.status !== 200)
      throw new Error(
        'dashboard not reachable; set DASHBOARD_URL[_TEST] and start the server to run E2E'
      )
  })
  afterAll(async () => {
    // nothing to cleanup; external server
  })

  it('MUST join existing network flow when env provided', async () => {
    const hs = HEADSCALE_URL
    const key = TS_AUTHKEY
    const host = TS_HOSTNAME
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

    // In containerized runs, tailscale status on host isn't indicative. Rely on SSE ok.
  }, 180_000)

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
    const create = await createRes.json().catch(async () => ({ raw: await createRes.text() }))
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
      if (!createRes.ok) {
        throw new Error(
          `org create failed: status=${createRes.status} body=${JSON.stringify(create)}`
        )
      }
      expect(create && (create.ok || create.org)).toBeTruthy()
      if (create.org) expect(create.org.name).toBe(name)
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

  it('MUST complete tailscale setup (local headscale)', async () => {
    const host = TS_HOSTNAME
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
  const qs = new URLSearchParams({ flow: 'create', mode: 'external', token: DASHBOARD_TOKEN })
    if (HEADSCALE_URL) qs.set('HEADSCALE_URL', HEADSCALE_URL)
    if (TS_AUTHKEY) qs.set('TS_AUTHKEY', TS_AUTHKEY)
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
    // Heavy flows are validated via SSE ok; Talos bootstrap is covered separately.
  }, 240_000)
})

// RUN_TAILSCALE_E2E=1 SETUP_ALLOW_INTERACTIVE=0 DASHBOARD_TOKEN=dashboard-secret npm run test:e2e
