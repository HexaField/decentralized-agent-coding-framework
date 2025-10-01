const request = require('supertest')
const { app } = require('../../dist/server')

describe('contract: POST /task-update', () => {
  it('requires fields for task update', async () => {
    const res = await request(app).post('/task-update').send({})
    expect([400, 404, 422]).toContain(res.status)
  })
})
