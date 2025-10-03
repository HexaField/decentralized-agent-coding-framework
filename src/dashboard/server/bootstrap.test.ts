import supertest from 'supertest'

let app: any
let request: any

beforeAll(async () => {
  // Point orchestrator URL to a closed port to fail fast
  process.env.ORCHESTRATOR_URL = 'http://127.0.0.1:1'
  process.env.DASHBOARD_TOKEN = process.env.DASHBOARD_TOKEN || 'dashboard-secret'
  ;({ default: app } = await import('./index.js'))
  request = supertest(app)
})

// Happy path proxy: returns error from orchestrator cleanly (since orch not running here)
// Ensures route is wired and requires auth
it('MUST require authentication for bootstrap proxy', async () => {
  await request.post('/api/orgs/acme/bootstrap').send({ cpNodes: ['1.2.3.4'] }).expect(401)
})

it('SHOULD forward to orchestrator and return 502 when orchestrator is absent', async () => {
  const res = await request
    .post('/api/orgs/acme/bootstrap')
    .set('X-Auth-Token', 'dashboard-secret')
    .send({ cpNodes: ['1.2.3.4'] })
  // When orchestrator is not running, our helper returns 502 with error message
  expect([502, 500]).toContain(res.status)
})
