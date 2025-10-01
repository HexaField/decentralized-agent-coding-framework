const WebSocket = require('ws')

describe('contract: WS /v1/stream', () => {
  it('connects and receives a status or heartbeat', async () => {
    const { server } = require('../../dist/server')
    const address = server.address()
    if (!address) return
    const port = typeof address === 'string' ? 8080 : address.port
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/v1/stream`)
      const to = setTimeout(() => reject(new Error('timeout')), 3000)
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(String(data))
          if (msg && (msg.type === 'status' || msg.type === 'heartbeat')) {
            clearTimeout(to)
            ws.close()
            resolve()
          }
        } catch (_) {}
      })
      ws.on('error', reject)
    })
  })
})
