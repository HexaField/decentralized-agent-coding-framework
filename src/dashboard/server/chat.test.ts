import 'dotenv/config'

describe('Dashboard /api/debug/ensure (agent appears)', () => {
  it('succeeds and the agent registers', async () => {
    const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://127.0.0.1:8090'
    const org = process.env.ORG || 'acme'
    const r = await fetch(`${DASHBOARD_URL}/api/debug/ensure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org, prompt: 'repro tls x509 via test' }),
    })
    // Expect success now that kubeconfig is container-reachable and TLS is relaxed in dev
    expect(r.status).toBe(200)
    const ct = r.headers.get('content-type') || ''
    expect(ct).toMatch(/json/)
    const body = await r.json()
    expect(body.ok).toBe(true)
    expect(body.ensure).toBeTruthy()

    // Poll /api/state for the agent to appear
    const deadline = Date.now() + 60_000
    let seen = false
    while (Date.now() < deadline && !seen) {
      const s = await fetch(`${DASHBOARD_URL}/api/state`)
      expect(s.status).toBe(200)
      const sb = await s.json()
      const agents = Array.isArray(sb.agents) ? sb.agents : []
      if (agents.length > 0) {
        seen = true
        break
      }
      await new Promise((r) => setTimeout(r, 2000))
    }
    expect(seen).toBe(true)
  }, 120_000)
})

// can ping the api with curl -sS -X POST http://127.0.0.1:8090/api/debug/ensure -H 'Content-Type: application/json' -d '{"org":"acme","prompt":"test"}' | jq -C .
