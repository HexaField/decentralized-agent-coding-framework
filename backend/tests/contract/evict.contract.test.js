const request = require('supertest')
const { app } = require('../../dist/server')

describe('contract: POST /evict', () => {
  it('requires a pod identifier', async () => {
    const res = await request(app).post('/evict').send({})
    expect([400, 404, 422]).toContain(res.status)
  })
})
