import 'dotenv/config'

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://127.0.0.1:8090'

describe('Dashboard integration (server up, orchestrator reachable)', () => {
  it('GET /api/health returns ok', async () => {
    const r = await fetch(`${DASHBOARD_URL}/api/health`, { method: 'GET' })
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body).toHaveProperty('status', 'ok')
  })

  it('GET /api/debug returns state and health', async () => {
    const r = await fetch(`${DASHBOARD_URL}/api/debug`, { method: 'GET' })
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body).toHaveProperty('ok', true)
    expect(body).toHaveProperty('health')
    expect(body).toHaveProperty('tasks')
    expect(body).toHaveProperty('agents')
  })

  it('SSE /api/stream/task yields heartbeats', async () => {
    const ac = new AbortController()
    const res = await fetch(`${DASHBOARD_URL}/api/stream/task`, {
      method: 'GET',
      signal: ac.signal,
    })
    expect(res.status).toBe(200)
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let gotHeartbeat = false
    const deadline = Date.now() + 15000
    let buffer = ''
    while (Date.now() < deadline && !gotHeartbeat) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // parse simple SSE lines
      const lines = buffer.split(/\r?\n/)
      // keep last partial line in buffer
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (line.startsWith('event:')) {
          const evt = line.slice(6).trim()
          if (evt === 'heartbeat') {
            gotHeartbeat = true
            break
          }
        }
      }
    }
    ac.abort()
    expect(gotHeartbeat).toBe(true)
  })
})
