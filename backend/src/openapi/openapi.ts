import { Router } from 'express'

export function createOpenApiRouter() {
  const r = Router()
  const spec = {
    openapi: '3.0.3',
    info: { title: 'Orchestrator API', version: '0.1.0' },
    paths: {
      '/health': { get: { summary: 'Node health and capacity' } },
      '/pods': { get: { summary: 'List managed workloads' } },
      '/schedule': { post: { summary: 'Request workload placement' } },
      '/evict': { post: { summary: 'Evict a workload' } },
      '/task-update': { post: { summary: 'Push task updates to Spec-Kit/MCP' } },
      '/v1/context/search': { get: { summary: 'Search context' } },
      '/v1/stream': { get: { summary: 'WebSocket stream' } }
    }
  }
  r.get('/openapi.json', (_req, res) => res.json(spec))
  return r
}
