/* eslint-env node */
/* global describe, it, expect */
const request = require('supertest');
const { app } = require('../src/server');

describe('health', () => {
  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
  });
});
