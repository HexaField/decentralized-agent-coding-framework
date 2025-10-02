import 'dotenv/config'

describe('Dashboard /api/debug/ensure (happy path)', () => {
  it('succeeds and returns ensure details', async () => {
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
  }, 120_000)
})
