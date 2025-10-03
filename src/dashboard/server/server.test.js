process.env.ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://127.0.0.1:9' // force error path for test
import request from 'supertest'
import app from './index.js'

describe('dashboard server', () => {
  it('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health')
  expect(res.status).toBe(200)
  expect(res.body).toHaveProperty('status', 'ok')
  })

  it('GET /api/state returns shape even when orchestrator is unreachable', async () => {
    const res = await request(app).get('/api/state')
  expect(res.status).toBe(200)
  expect(res.body).toHaveProperty('tasks')
  expect(res.body).toHaveProperty('agents')
  })
})
