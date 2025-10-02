const request = require('supertest')
process.env.ORCHESTRATOR_URL = 'http://127.0.0.1:9' // force error path
const app = require('./server')

describe('dashboard', ()=>{
  it('health ok', async ()=>{
    await request(app).get('/api/health').expect(200)
  })
  it('state returns json even if orchestrator unreachable', async ()=>{
    const res = await request(app).get('/api/state').expect(200)
    if(!('tasks' in res.body)) throw new Error('missing tasks')
  })
})
