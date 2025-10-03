import 'dotenv/config'
import http from 'http'
import app from './index.js'

describe('Dashboard integration: server MUST respond and SHOULD expose debug stream', () => {
  let server: http.Server | null = null
  let base: string = 'http://127.0.0.1:0'

  beforeAll(async () => {
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

  it('MUST return ok for GET /api/health', async () => {
    const r = await fetch(`${base}/api/health`, { method: 'GET' })
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body).toHaveProperty('status', 'ok')
  })

  it('MUST return state and health for GET /api/debug', async () => {
    const r = await fetch(`${base}/api/debug`, { method: 'GET' })
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body).toHaveProperty('ok', true)
    expect(body).toHaveProperty('health')
    expect(body).toHaveProperty('tasks')
    expect(body).toHaveProperty('agents')
  })

  it('SHOULD yield heartbeats on SSE /api/debug/stream', async () => {
    const ac = new AbortController()
    const res = await fetch(`${base}/api/debug/stream`, {
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
