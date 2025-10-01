const request = require('supertest')
const { app } = require('../../dist/server')

describe('contract: GET /v1/context/search', () => {
  it('returns results array', async () => {
    const res = await request(app).get('/v1/context/search?q=hello')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('results')
    expect(Array.isArray(res.body.results)).toBe(true)
  })
})
