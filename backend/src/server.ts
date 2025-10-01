import http from 'node:http'
import cors, { CorsOptions } from 'cors'
import express, { NextFunction, Request, Response } from 'express'
import { WebSocket, WebSocketServer } from 'ws'
import { createOpenApiRouter } from './openapi/openapi.js'
import { getLocalCapacity } from './orchestrator/capacity.js'

// Types
type JobStatus = 'queued' | 'running' | 'completed' | 'cancelled' | 'failed'
interface Job {
  id: string
  createdAt: number
  updatedAt: number
  status: JobStatus
  input?: unknown
  result?: unknown
  error?: string
  idempotencyKey?: string
}

// In-memory job store
const jobs = new Map<string, Job>()
const idempotencyIndex = new Map<string, string>() // idempotencyKey -> jobId

// Config
const PORT = Number(process.env.API_PORT || 8080)
const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map((s) => s.trim())

// Basic validators (keep minimal for now)
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

// Express app
const app = express()
app.use(express.json({ limit: '2mb' }))
// simple JSON logger with request id
app.use((req, _res, next) => {
  const reqId =
    (req.headers['x-request-id'] as string) || Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  ;(req as any).reqId = reqId
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'request',
      reqId,
      method: req.method,
      url: req.url
    })
  )
  next()
})
const corsOptions: CorsOptions = {
  origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
    cb(new Error('CORS blocked'))
  }
}
app.use(cors(corsOptions))

// Request ID (simple)
app.use((req, _res, next) => {
  ;(req as any).reqId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  next()
})

// Health endpoints
app.get('/health', (_req, res) => res.json({ ok: true, capacity: getLocalCapacity() }))
app.get('/ready', (_req, res) => res.json({ ready: true }))

// OpenAPI route
app.use(createOpenApiRouter())

// Jobs API
// Create job with optional idempotency key
// Basic in-memory rate limit for job creation per IP
const rlWindowMs = 60_000
const rlMax = 60
const rlStore = new Map<string, { count: number; start: number }>()
function limit(ip: string): boolean {
  const now = Date.now()
  const rec = rlStore.get(ip)
  if (!rec || now - rec.start > rlWindowMs) {
    rlStore.set(ip, { count: 1, start: now })
    return true
  }
  if (rec.count >= rlMax) return false
  rec.count++
  return true
}
app.post('/v1/jobs', (req, res, next) => {
  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown'
  if (!limit(ip)) return res.status(429).json({ error: 'rate_limited' })
  try {
    const idempotencyKey = req.header('Idempotency-Key') || undefined
    if (idempotencyKey && idempotencyIndex.has(idempotencyKey)) {
      const existingId = idempotencyIndex.get(idempotencyKey)!
      const existing = jobs.get(existingId)!
      return res.status(200).json({ jobId: existing.id, status: existing.status })
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const now = Date.now()
    const job: Job = {
      id: jobId,
      createdAt: now,
      updatedAt: now,
      status: 'queued',
      input: req.body ?? undefined,
      idempotencyKey
    }
    jobs.set(jobId, job)
    if (idempotencyKey) idempotencyIndex.set(idempotencyKey, jobId)

    // Simulate async run
    setTimeout(() => {
      const j = jobs.get(jobId)
      if (!j || j.status !== 'queued') return
      j.status = 'running'
      j.updatedAt = Date.now()
      setTimeout(() => {
        const j2 = jobs.get(jobId)
        if (!j2 || j2.status !== 'running') return
        j2.status = 'completed'
        j2.result = { echo: j2.input ?? null }
        j2.updatedAt = Date.now()
      }, 250)
    }, 10)

    res.status(202).json({ jobId, status: job.status })
  } catch (err) {
    next(err)
  }
})

// Get job status
app.get('/v1/jobs/:id', (req, res) => {
  const { id } = req.params
  const job = jobs.get(id)
  if (!job) return res.status(404).json({ error: 'not_found' })
  return res.json({
    id: job.id,
    status: job.status,
    result: job.result ?? null,
    error: job.error ?? null
  })
})

// Cancel job
app.post('/v1/jobs/:id/cancel', (req, res) => {
  const { id } = req.params
  const job = jobs.get(id)
  if (!job) return res.status(404).json({ error: 'not_found' })
  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
    return res.status(409).json({ error: 'not_cancellable' })
  }
  job.status = 'cancelled'
  job.updatedAt = Date.now()
  return res.json({ id: job.id, status: job.status })
})

// Context search (mock)
app.get('/v1/context/search', (req, res) => {
  const q = (req.query.q as string) || ''
  res.json({ query: q, results: [] })
})

// Error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = 400
  res.status(status).json({ error: 'bad_request', message: String(err?.message || err) })
})

// HTTP + WebSocket
const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/v1/stream' })
wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
  // Simple token check (optional)
  const url = new URL(req.url ?? '', `http://${req.headers.host}`)
  const token = url.searchParams.get('token')
  if (token && !isNonEmptyString(token)) {
    ws.close(1008, 'invalid token')
    return
  }
  ws.send(JSON.stringify({ type: 'status', ts: Date.now(), payload: 'connected' }))

  const interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      // Backpressure: if bufferedAmount huge, skip heartbeat
      if (ws.bufferedAmount > 1024 * 1024) return
      ws.send(JSON.stringify({ type: 'heartbeat', ts: Date.now(), payload: 'ping' }))
    }
  }, 10000)
  ws.on('close', () => clearInterval(interval))
})

// ESM entrypoint guard
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`orchestrator listening on :${PORT}`)
  })
}

export { app, server }
