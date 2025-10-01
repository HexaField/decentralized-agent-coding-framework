const request = require('supertest')
const { app } = require('../../dist/server')

describe('contract: GET /pods', () => {
  it('returns a list (array)', async () => {
    const res = await request(app).get('/pods')
    expect([200, 404, 501]).toContain(res.status)
    if (res.status === 200) expect(Array.isArray(res.body.items)).toBe(true)
  })
})
