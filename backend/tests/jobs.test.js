/* global describe, it, expect */
const request = require('supertest')
const { app } = require('../dist/server')

describe('jobs lifecycle', () => {
  it('creates a job and reaches completed', async () => {
    const agent = request(app)
    const resCreate = await agent.post('/v1/jobs').send({ foo: 'bar' })
    expect(resCreate.status).toBe(202)
    const { jobId } = resCreate.body
    expect(jobId).toBeTruthy()

    let status = 'queued'
    const started = Date.now()
    while (Date.now() - started < 3000 && status !== 'completed') {
      const resGet = await agent.get(`/v1/jobs/${jobId}`)
      expect(resGet.status).toBe(200)
      status = resGet.body.status
      if (status !== 'completed') await new Promise((r) => setTimeout(r, 50))
    }
    expect(status).toBe('completed')
  })

  it('supports idempotency key', async () => {
    const key = `key_${Date.now()}`
    const agent = request(app)
    const a = await agent.post('/v1/jobs').set('Idempotency-Key', key).send({ a: 1 })
    const b = await agent.post('/v1/jobs').set('Idempotency-Key', key).send({ a: 1 })
    expect(a.body.jobId).toBe(b.body.jobId)
  })
})
