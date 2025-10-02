process.env.ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://127.0.0.1:9' // force error path for test
const request = require('supertest')
const app = require('./server')

describe('dashboard server', () => {
  it('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health')
    res.status.should.equal(200)
    res.body.should.have.property('status', 'ok')
  })

  it('GET /api/state returns shape even when orchestrator is unreachable', async () => {
    const res = await request(app).get('/api/state')
    res.status.should.equal(200)
    res.body.should.have.property('tasks')
    res.body.should.have.property('agents')
  })
})
