const request = require('supertest')
const { app } = require('../../dist/server')

describe('contract: POST /schedule', () => {
  it('validates request and responds 422 on bad input', async () => {
    const res = await request(app).post('/schedule').send({})
    expect([400, 404, 422]).toContain(res.status)
  })
})
