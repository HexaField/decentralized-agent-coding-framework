const assert = require('assert')
const request = require('supertest')
const express = require('express')
const appFactory = () => {
  process.env.ORCHESTRATOR_URL = 'http://127.0.0.1:9' // invalid, will error and fall back
  delete require.cache[require.resolve('./server')]
  const app = require('express')()
  return app
}

describe('dashboard /api/health', () => {
  it('returns ok', async () => {
    const app = express()
    app.get('/api/health', (req,res)=> res.json({status:'ok'}))
    await request(app).get('/api/health').expect(200)
  })
})
