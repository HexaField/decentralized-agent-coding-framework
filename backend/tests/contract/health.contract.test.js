/* eslint-env node */
const request = require('supertest')
const { app } = require('../../dist/server')

describe('contract: GET /health', () => {
  it('returns ok and capacity shape', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('ok', true)
    expect(res.body).toHaveProperty('capacity')
    const c = res.body.capacity
    expect(typeof c.cpuCores).toBe('number')
    expect(c.cpuCores).toBeGreaterThan(0)
    expect(typeof c.memoryBytes).toBe('number')
    expect(c.memoryBytes).toBeGreaterThan(0)
  })
})
