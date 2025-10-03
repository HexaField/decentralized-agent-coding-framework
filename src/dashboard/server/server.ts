import 'dotenv/config'
import express from 'express'
import path from 'path'
import fs from 'fs'
import http from 'http'
import https from 'https'
import httpProxy from 'http-proxy'
import { execFile, spawn } from 'child_process'
import sqlite3 from 'sqlite3'
import { open, Database } from 'sqlite'

const app = express()
app.use(express.json())

const PORT = Number(process.env.PORT || 8090)
const TOKEN = process.env.DASHBOARD_TOKEN || 'dashboard-secret'
const ORCH_URL =
  process.env.ORCHESTRATOR_URL ||
  (process.env.UI_DEV === '1' ? 'http://127.0.0.1:18080' : 'http://mvp-orchestrator:8080')
const ORCH_TOKEN = process.env.ORCHESTRATOR_TOKEN || process.env.DASHBOARD_TOKEN || ''
const LOCAL_ENSURE = process.env.LOCAL_ENSURE === '1'
const proxy = httpProxy.createProxyServer({ ws: true, changeOrigin: true, xfwd: true })
// Optional auth header for agent fallback HTTP server; harmless for code-server
const CS_AUTH_HEADER = process.env.CODE_SERVER_AUTH_HEADER || 'X-Agent-Auth'
const CS_AUTH_TOKEN = process.env.CODE_SERVER_TOKEN || 'password'

// Relax frame embedding for proxied responses
proxy.on('proxyRes', (proxyRes, req: any, res) => {
  try {
    delete (proxyRes as any).headers['x-frame-options']
    delete (proxyRes as any).headers['content-security-policy']
    res.setHeader('X-Frame-Options', 'ALLOWALL')
    // If this is an embed request, rewrite redirects and cookie paths to stay under the embed base
    const base: string | undefined = req && req._embedBase
    if (base) {
      const headers: any = (proxyRes as any).headers || {}
      const loc = headers['location'] || headers['Location']
      if (typeof loc === 'string' && loc) {
        try {
          let newLoc = loc
          if (loc.startsWith('/')) {
            newLoc = base + loc
          } else {
            const u = new URL(loc)
            // strip scheme+host and keep pathname+search
            newLoc = base + u.pathname + (u.search || '')
          }
          headers['location'] = newLoc
        } catch {}
      }
      const setCookie = headers['set-cookie'] || headers['Set-Cookie']
      if (setCookie) {
        const arr = Array.isArray(setCookie) ? setCookie : [String(setCookie)]
        const rewritten = arr.map((c: string) => {
          let cc = c
          // Ensure cookie path stays under embed base
          cc = cc.replace(/Path=\/?(;|$)/i, `Path=${base}/$1`)
          // Drop Secure for local http; optional: force SameSite=Lax to avoid None;Secure requirement
          cc = cc.replace(/;\s*Secure/gi, '')
          cc = cc.replace(/;\s*SameSite=None/gi, '; SameSite=Lax')
          // Drop Domain attribute so cookie is set for current host only
          cc = cc.replace(/;\s*Domain=[^;]*/gi, '')
          return cc
        })
        headers['set-cookie'] = rewritten
      }
    }
  } catch {}
})
proxy.on('error', (err, req, res: any) => {
  try {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' })
    res.end('proxy error: ' + String(err))
  } catch {}
})

// CORS: allow configured frontend origins (comma-separated via CORS_ORIGINS or FRONTEND_ORIGIN)
const ALLOW_ORIGINS = (process.env.CORS_ORIGINS || process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
app.use((req, res, next) => {
  const origin = (req.headers.origin as string) || ''
  const configured = ALLOW_ORIGINS.length > 0
  const allowStar = configured && ALLOW_ORIGINS.includes('*')
  const allowed = allowStar || (configured && origin && ALLOW_ORIGINS.includes(origin))
  if (configured && allowed) {
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Origin', allowStar ? '*' : origin)
    if (!allowStar) res.setHeader('Access-Control-Allow-Credentials', 'true')
  } else if (!configured) {
    // Permissive default for dev: allow all origins
    res.setHeader('Access-Control-Allow-Origin', '*')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Auth-Token')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  next()
})

function fetchJSON(
  urlStr: string,
  opts: { method?: string; headers?: Record<string, string>; body?: any } = {}
): Promise<any> {
  return new Promise((resolve, reject) => {
    const attempt = (raw: string, triedFallback = false) => {
      const u = new URL(raw)
      const isHttps = u.protocol === 'https:'
      const lib = isHttps ? https : http
      const req = lib.request(
        {
          hostname: u.hostname,
          port: Number(u.port || (isHttps ? 443 : 80)),
          path: u.pathname + (u.search || ''),
          method: opts.method || 'GET',
          headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}),
          // Accept self-signed when talking to local dev https targets
          ...(isHttps ? ({ rejectUnauthorized: false } as any) : {}),
        },
        (res) => {
          let data = ''
          res.on('data', (d: any) => (data += d))
          res.on('end', () => {
            const status = res.statusCode || 0
            const ct = String((res.headers as any)['content-type'] || '')
            const isJSON = ct.includes('application/json')
            if (status >= 400) {
              const snippet = (data || '').slice(0, 200)
              return reject(new Error(`${status} ${snippet}`))
            }
            if (!data) return resolve({})
            if (isJSON) {
              try {
                return resolve(JSON.parse(data))
              } catch (e) {
                return reject(e)
              }
            }
            return resolve({ text: data })
          })
        }
      )
      req.on('error', (err: any) => {
        const msg = String((err && (err.code || err.message)) || '')
        if (
          !triedFallback &&
          u.protocol === 'https:' &&
          /EPROTO|WRONG_VERSION_NUMBER|wrong version number/i.test(msg)
        ) {
          // Retry once with http scheme if https failed with TLS version issues
          const fallback = 'http://' + u.host + u.pathname + (u.search || '')
          return attempt(fallback, true)
        }
        reject(err)
      })
      if (opts.body)
        req.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body))
      req.end()
    }
    attempt(urlStr)
  })
}

// In-memory chats
const chats: { global: Array<{ role: 'user' | 'assistant' | 'system'; text: string }> } = {
  global: [],
}
// SQLite orgs persistence
let dbPromise: Promise<Database<sqlite3.Database, sqlite3.Statement>> | null = null
function getDB() {
  if (!dbPromise) {
    const repoRoot = path.resolve(path.dirname(here), '..')
    const dataDir = process.env.DASHBOARD_DATA_DIR || path.join(repoRoot, '..', 'state')
    const dbPath = path.join(dataDir, 'dashboard.db')
    fs.mkdirSync(dataDir, { recursive: true })
    dbPromise = open({ filename: dbPath, driver: sqlite3.Database }).then(async (db) => {
      await db.exec(
        'CREATE TABLE IF NOT EXISTS orgs (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)'
      )
      await db.exec(
        'CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)'
      )
      return db
    })
  }
  return dbPromise
}

// Orgs API
app.get('/api/orgs', async (req, res) => {
  try {
    const db = await getDB()
    const rows = await db.all('SELECT id, name, created_at FROM orgs ORDER BY id ASC')
    res.json({ ok: true, orgs: rows })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})
app.post('/api/orgs', async (req, res) => {
  if ((req.headers['x-auth-token'] as string) !== TOKEN)
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  const name = (req.body && String(req.body.name || '').trim()) || ''
  if (!name) return res.status(400).json({ ok: false, error: 'name required' })
  try {
    const db = await getDB()
    await db.run('INSERT INTO orgs(name) VALUES (?)', name)
    const row = await db.get('SELECT id, name, created_at FROM orgs WHERE name=?', name)
    res.json({ ok: true, org: row })
  } catch (e: any) {
    if (String(e && e.message).includes('UNIQUE'))
      return res.status(409).json({ ok: false, error: 'exists' })
    res.status(500).json({ ok: false, error: String(e) })
  }
})
app.delete('/api/orgs/:id', async (req, res) => {
  if ((req.headers['x-auth-token'] as string) !== TOKEN)
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ ok: false, error: 'bad id' })
  try {
    const db = await getDB()
    await db.run('DELETE FROM orgs WHERE id=?', id)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})
// removed unused agentChats

// __dirname replacement for ESM
const here = path.dirname(new URL(import.meta.url).pathname)
// If UI_DEV=1, proxy /ui to the Vite dev server (no build needed)
const UI_DEV = process.env.UI_DEV === '1'
if (UI_DEV) {
  const viteTarget = process.env.VITE_DEV_URL || 'https://localhost:5173'
  app.use('/ui', (req, res) => {
    proxy.web(req, res, { target: viteTarget, changeOrigin: true, xfwd: true, secure: false })
  })
} else {
  // Serve built UI if available (Vite build outputs to ui/dist)
  const builtUiDir = path.join(here, '..', 'ui', 'dist')
  const srcUiDir = path.join(here, '..', 'ui')
  if (fs.existsSync(builtUiDir)) {
    app.use('/ui', express.static(builtUiDir))
  } else {
    // Fallback: serve raw UI sources (useful before first build)
    app.use('/ui', express.static(srcUiDir))
  }
}

// Reverse proxy to embed local editors (HTTP)
app.use('/embed/local/:port', (req, res) => {
  const port = Number(req.params.port)
  if (!port || Number.isNaN(port)) return res.status(400).end('bad port')
  const target = `http://host.docker.internal:${port}`
  // rewrite path: /embed/local/:port/(.*) -> /$1
  const rest = req.url.replace(/^\/embed\/local\/\d+/, '') || '/'
  ;(req as any).url = rest
  ;(req as any)._embedBase = `/embed/local/${port}`
  const hdrs: any = { [CS_AUTH_HEADER]: CS_AUTH_TOKEN }
  if (req.headers.origin) hdrs.origin = String(req.headers.origin)
  proxy.web(req, res, { target, changeOrigin: true, xfwd: true, headers: hdrs })
})

// Reverse proxy to embed editors forwarded inside orchestrator container
app.use('/embed/orchestrator/:port', (req, res) => {
  const port = Number(req.params.port)
  if (!port || Number.isNaN(port)) return res.status(400).end('bad port')
  const orchBase = ORCH_URL.replace(/\/$/, '')
  const target = `${orchBase}/editor/proxy/${port}`
  const rest = req.url.replace(/^\/embed\/orchestrator\/(\d+)/, '') || '/'
  ;(req as any).url = rest
  ;(req as any)._embedBase = `/embed/orchestrator/${port}`
  const hdrs: any = Object.assign(
    { [CS_AUTH_HEADER]: CS_AUTH_TOKEN },
    ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
  )
  if (req.headers.origin) hdrs.origin = String(req.headers.origin)
  proxy.web(req, res, { target, changeOrigin: true, xfwd: true, headers: hdrs, secure: false })
})

app.use((req, res, next) => {
  const safe = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS'
  if (!safe) {
    if (
      process.env.NODE_ENV !== 'production' &&
      (req.path.startsWith('/api/debug') ||
        req.path.startsWith('/api/ensure') ||
        req.path.startsWith('/api/editor'))
    ) {
      return next()
    }
    if (req.headers['x-auth-token'] !== TOKEN)
      return res.status(401).json({ error: 'unauthorized' })
  }
  next()
})

app.get('/api/health', (req, res) => res.json({ status: 'ok' }))
app.get('/api/state', async (req, res) => {
  try {
    const headers: Record<string, string> = ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
    const [tasks, agents] = await Promise.all([
      fetchJSON(`${ORCH_URL}/tasks`, { headers }),
      fetchJSON(`${ORCH_URL}/agents`, { headers }),
    ])
    let pr: any = null
    try {
      const p = path.join('/state', 'radicle', 'last_pr.json')
      if (fs.existsSync(p)) pr = JSON.parse(fs.readFileSync(p, 'utf8'))
    } catch {}
    res.json({ tasks, agents, clusters: [], prs: pr ? [pr] : [] })
  } catch (e) {
    res.status(200).json({ tasks: [], agents: [], clusters: [], prs: [], error: String(e) })
  }
})

app.post('/api/command', (req, res) => {
  const q = (req.body && req.body.q) || ''
  res.json({ ok: true, echo: q })
})

// Ensure helper: local (dev) or orchestrator-backed
async function ensureAgent(org: string, prompt: string) {
  if (LOCAL_ENSURE) {
    const deploy = path.resolve(here, '..', '..', 'scripts', 'deploy_agent.sh')
    return new Promise((resolve, reject) => {
      execFile('bash', [deploy, org, prompt], { env: process.env }, (err, stdout, stderr) => {
        if (err) return reject(new Error((stdout || '') + (stderr || '') || String(err)))
        resolve({ ok: true, output: String(stdout), mode: 'local' })
      })
    })
  }
  const headers: Record<string, string> = ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
  return fetchJSON(`${ORCH_URL}/agents/ensure`, { method: 'POST', headers, body: { org, prompt } })
}

// Public API for ensure (POST requires dashboard token header)
app.post('/api/ensure', async (req, res) => {
  try {
    const org = (req.body && req.body.org) || 'acme'
    const prompt = (req.body && req.body.prompt) || ''
    const out = await ensureAgent(org, prompt)
    res.json({ ok: true, ensure: out })
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e) })
  }
})

// Editor control: proxy to orchestrator endpoints
app.post('/api/editor/open', async (req, res) => {
  try {
    const name = (req.body && req.body.name) || ''
    const org = (req.body && req.body.org) || ''
    if (!name) return res.status(400).json({ error: 'missing name' })
    const headers: Record<string, string> = ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
    const out = await fetchJSON(`${ORCH_URL}/agents/editor/open`, {
      method: 'POST',
      headers,
      body: { name, org },
    })
    res.json(out)
  } catch (e) {
    res.status(502).json({ error: String(e) })
  }
})
app.post('/api/editor/close', async (req, res) => {
  try {
    const name = (req.body && req.body.name) || ''
    if (!name) return res.status(400).json({ error: 'missing name' })
    const headers: Record<string, string> = ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
    const out = await fetchJSON(`${ORCH_URL}/agents/editor/close`, {
      method: 'POST',
      headers,
      body: { name },
    })
    res.json(out)
  } catch (e) {
    res.status(502).json({ error: String(e) })
  }
})

// Chat APIs
app.get('/api/chat', (req, res) => {
  res.json({ messages: chats.global })
})
app.post('/api/chat', async (req, res) => {
  const org = (req.body && req.body.org) || 'acme'
  const text = (req.body && req.body.text) || ''
  chats.global.push({ role: 'user', text })
  try {
    const headers: Record<string, string> = ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
    const body = { org, task: text }
    const out = await fetchJSON(`${ORCH_URL}/schedule`, { method: 'POST', headers, body })
    await ensureAgent(org, text).catch(() => ({}))
    chats.global.push({ role: 'system', text: `scheduled task ${out.id || ''}` })
    res.json({ ok: true, task: out })
  } catch (e) {
    res.status(502).json({ error: String(e) })
  }
})

// Proxy: task/agent logs and SSE streams expected by UI
app.get('/api/taskLogs', async (req, res) => {
  const id = String(req.query.id || '')
  if (!id) return res.status(400).json({ error: 'missing id' })
  try {
    const headers: Record<string, string> = ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
    const out = await fetchJSON(`${ORCH_URL}/tasks/logs?id=${encodeURIComponent(id)}`, { headers })
    res.json(out)
  } catch (e) {
    res.status(502).json({ error: String(e) })
  }
})
app.get('/api/agentLogs', async (req, res) => {
  const name = String(req.query.name || '')
  if (!name) return res.status(400).json({ error: 'missing name' })
  try {
    const headers: Record<string, string> = ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
    const out = await fetchJSON(`${ORCH_URL}/agents/logs?name=${encodeURIComponent(name)}`, {
      headers,
    })
    res.json(out)
  } catch (e) {
    res.status(502).json({ error: String(e) })
  }
})

// Setup status: check/persist Tailscale connectivity
app.get('/api/setup/status', async (req, res) => {
  try {
    const db = await getDB()
    // fast path: return persisted state if recent
    const row = await db.get('SELECT value FROM kv WHERE key=?', 'tailscale_connected')
    const persisted = row ? row.value === '1' : false
    // If we've ever connected, keep it sticky unless explicitly reset.
    if (persisted) return res.json({ ok: true, connected: true })
    // Otherwise, probe tailscale; "tailscale status --json" or fallback to Headscale /health
    let connected = false
    try {
      const out = await new Promise<string>((resolve, reject) => {
        const p = spawn('tailscale', ['status', '--json'])
        let buf = ''
        p.stdout.on('data', (d) => (buf += String(d)))
        p.stderr.on('data', (d) => (buf += String(d)))
        p.on('close', (code) =>
          code === 0 ? resolve(buf) : reject(new Error(buf || String(code)))
        )
      })
      try {
        const j = JSON.parse(out)
        connected = Boolean(j && j.Self && j.Self.TailAddr)
      } catch {
        connected = /relay|wgpeer|hostinfo/i.test(out)
      }
    } catch {
      // Optional: if we have HS URL, try its /health as a very weak signal
      const hsUrl = process.env.HEADSCALE_URL
      if (hsUrl) {
        try {
          const health = await fetchJSON(hsUrl.replace(/\/$/, '') + '/health').catch(() => ({}))
          connected = Boolean(health && (health.status === 'pass' || health.status === 'ok'))
        } catch {}
      }
    }
    // persist only positive detection; do not downgrade sticky state here
    if (connected) {
      await db.run(
        'INSERT INTO kv(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP',
        'tailscale_connected',
        '1'
      )
    }
    res.json({ ok: true, connected })
  } catch (e) {
    res.status(200).json({ ok: false, connected: false, error: String(e) })
  }
})
// SSE proxy: tasks
app.get('/api/stream/task', (req, res) => {
  const id = String(req.query.id || '')
  if (!id) return res.status(400).end('missing id')
  const headers: Record<string, string> = {}
  if (ORCH_TOKEN) headers['X-Auth-Token'] = ORCH_TOKEN
  const targetUrl = new URL(`${ORCH_URL}/events/tasks?id=${encodeURIComponent(id)}`)
  // forward request manually to preserve SSE
  const lib = targetUrl.protocol === 'https:' ? https : http
  const r = lib.request(
    {
      method: 'GET',
      hostname: targetUrl.hostname,
      port: Number(targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80)),
      path: targetUrl.pathname + targetUrl.search,
      headers,
    },
    (rr) => {
      res.writeHead(rr.statusCode || 200, rr.headers)
      rr.pipe(res)
    }
  )
  r.on('error', () => res.end())
  r.end()
})
// SSE proxy: agents
app.get('/api/stream/agent', (req, res) => {
  const name = String(req.query.name || '')
  if (!name) return res.status(400).end('missing name')
  const headers: Record<string, string> = {}
  if (ORCH_TOKEN) headers['X-Auth-Token'] = ORCH_TOKEN
  const targetUrl = new URL(`${ORCH_URL}/events/agents?name=${encodeURIComponent(name)}`)
  const lib = targetUrl.protocol === 'https:' ? https : http
  const r = lib.request(
    {
      method: 'GET',
      hostname: targetUrl.hostname,
      port: Number(targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80)),
      path: targetUrl.pathname + targetUrl.search,
      headers,
    },
    (rr) => {
      res.writeHead(rr.statusCode || 200, rr.headers)
      rr.pipe(res)
    }
  )
  r.on('error', () => res.end())
  r.end()
})

// Streaming chat: minimal SSE emitting status + scheduling + done
app.get('/api/chat/stream', async (req, res) => {
  const org = String(req.query.org || 'acme')
  const text = String(req.query.text || '')
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  const send = (event: string, data: string) => {
    res.write(`event: ${event}\n`)
    res.write(`data: ${data}\n\n`)
  }
  send('message', 'Thinking about your request…')
  try {
    const headers: Record<string, string> = ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
    const body = { org, task: text }
    const task = await fetchJSON(`${ORCH_URL}/schedule`, { method: 'POST', headers, body })
    send('task', JSON.stringify(task))
    // best-effort ensure agent, include details in stream
    try {
      const ensure = await fetchJSON(`${ORCH_URL}/agents/ensure`, {
        method: 'POST',
        headers,
        body: { org, prompt: text },
      })
      send('ensure', JSON.stringify(ensure))
      send('message', 'Task scheduled and ensure invoked.')
    } catch (ee) {
      send('ensure', JSON.stringify({ error: String(ee) }))
      send('message', 'Task scheduled; ensure failed (see debug).')
    }
  } catch (e) {
    send('message', `Error: ${String(e)}`)
  }
  send('done', '1')
  res.end()
})

// Debug SSE: emits initial state and periodic heartbeats so UI can log diagnostics in dev
app.get('/api/debug/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  const send = (event: string, data: any) => {
    res.write(`event: ${event}\n`)
    res.write(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`)
  }
  try {
    const headers: Record<string, string> = ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
    const [health, tasks, agents] = await Promise.all([
      fetchJSON(`${ORCH_URL}/health`, { headers }).catch((e) => ({ error: String(e) })),
      fetchJSON(`${ORCH_URL}/tasks`, { headers }).catch((e) => ({ error: String(e), tasks: [] })),
      fetchJSON(`${ORCH_URL}/agents`, { headers }).catch((e) => ({ error: String(e), agents: [] })),
    ])
    send('config', {
      server: 'dashboard',
      port: PORT,
      orch: ORCH_URL,
      orchTokenSet: Boolean(ORCH_TOKEN),
      uiDev: UI_DEV,
      corsOrigins: ALLOW_ORIGINS,
      ensureMode: LOCAL_ENSURE ? 'local' : 'orchestrator',
    })
    send('status', { message: 'connected' })
    send('health', health)
    send('state', { tasks, agents })
  } catch (e) {
    send('error', String(e))
  }
  const iv = setInterval(async () => {
    send('heartbeat', Date.now())
    try {
      const headers: Record<string, string> = ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
      const [tasks, agents] = await Promise.all([
        fetchJSON(`${ORCH_URL}/tasks`, { headers }).catch((e) => ({ error: String(e), tasks: [] })),
        fetchJSON(`${ORCH_URL}/agents`, { headers }).catch((e) => ({
          error: String(e),
          agents: [],
        })),
      ])
      send('state', { tasks, agents })
    } catch (e) {
      send('error', String(e))
    }
  }, 5000)
  req.on('close', () => clearInterval(iv))
})

// Debug: explicit ensure endpoint for troubleshooting
app.post('/api/debug/ensure', async (req, res) => {
  try {
    const org = (req.body && req.body.org) || 'acme'
    const prompt = (req.body && req.body.prompt) || ''
    const ensure = await ensureAgent(org, prompt)
    res.json({ ok: true, ensure })
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e) })
  }
})

// One-shot debug status
app.get('/api/debug', async (req, res) => {
  try {
    const headers: Record<string, string> = ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
    const [health, tasks, agents] = await Promise.all([
      fetchJSON(`${ORCH_URL}/health`, { headers }).catch((e) => ({ error: String(e) })),
      fetchJSON(`${ORCH_URL}/tasks`, { headers }).catch((e) => ({ error: String(e), tasks: [] })),
      fetchJSON(`${ORCH_URL}/agents`, { headers }).catch((e) => ({ error: String(e), agents: [] })),
    ])
    res.json({ ok: true, health, tasks, agents, server: { port: PORT, orch: ORCH_URL } })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// Setup automation: stream steps to create a new cluster or connect this device
app.get('/api/setup/stream', async (req, res) => {
  // Require dashboard token; allow via header or query param (EventSource can't set headers)
  const qtok = (req.query && (req.query as any).token) || ''
  const presented = (req.headers['x-auth-token'] as string) || String(qtok || '')
  if (presented !== TOKEN) {
    res.status(401).end('unauthorized')
    return
  }

  const flow = String(req.query.flow || 'connect') // 'create' | 'connect'
  const mode = String(req.query.mode || 'auto') // 'external' | 'local' | 'auto'
  const orgParam = String(req.query.org || '') // optional single org; default uses helpers
  // Optional config overrides from the UI
  const HS_URL = String((req.query as any).HEADSCALE_URL || '')
  const HS_SSH = String((req.query as any).HEADSCALE_SSH || '')
  const TS_KEY = String((req.query as any).TS_AUTHKEY || '')
  const TS_HOST = String((req.query as any).TS_HOSTNAME || '')

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  const send = (event: string, data: any) => {
    res.write(`event: ${event}\n`)
    res.write(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`)
  }

  const here = path.dirname(new URL(import.meta.url).pathname)
  const srcDir = path.resolve(here, '..', '..')
  const resolveScript = (name: string) => path.resolve(srcDir, 'scripts', name)
  const runStep = (
    title: string,
    file: string,
    args: string[] = [],
    envOverride: Record<string, string> = {}
  ) =>
    new Promise<void>((resolve, reject) => {
      send('step', { title, file, args })
      const childEnv: NodeJS.ProcessEnv = { ...process.env }
      if (HS_URL) childEnv.HEADSCALE_URL = HS_URL
      if (HS_SSH) childEnv.HEADSCALE_SSH = HS_SSH
      if (TS_KEY) childEnv.TS_AUTHKEY = TS_KEY
      if (TS_HOST) childEnv.TS_HOSTNAME = TS_HOST
      Object.assign(childEnv, envOverride)
      const proc = spawn('bash', [file, ...args], { cwd: srcDir, env: childEnv })
      proc.stdout.on('data', (d) => send('log', String(d)))
      proc.stderr.on('data', (d) => send('log', String(d)))
      proc.on('close', (code) => {
        if (code === 0) {
          send('stepDone', { title, code })
          resolve()
        } else {
          send('stepError', { title, code })
          reject(new Error(`${title} failed: ${code}`))
        }
      })
    })

  try {
    send('begin', { flow, mode, org: orgParam || undefined })

    const hsExternal = Boolean(HS_SSH.length)
    const effectiveMode = mode === 'auto' ? (hsExternal ? 'external' : 'local') : mode

    // Early input validation per flow to avoid long-running failures
    const missing: string[] = []
    if (flow === 'connect') {
      if (!HS_URL) missing.push('HEADSCALE_URL')
      if (!TS_KEY) missing.push('TS_AUTHKEY')
      if (!TS_HOST) missing.push('TS_HOSTNAME')
    } else if (flow === 'create') {
      // For local create, we'll bootstrap Headscale ourselves and can generate a preauth key
      if (effectiveMode === 'external' && !HS_URL) missing.push('HEADSCALE_URL')
      if (!TS_HOST) missing.push('TS_HOSTNAME')
    }
    if (missing.length) {
      send('error', `Missing required inputs for ${flow}: ${missing.join(', ')}`)
      send('done', { ok: false })
      return res.end()
    }

    if (flow === 'create') {
      // 1) Bootstrap Headscale (external/local)
      if (effectiveMode === 'external')
        await runStep('Headscale bootstrap (external)', resolveScript('hs_bootstrap_external.sh'))
      else await runStep('Headscale bootstrap (local)', resolveScript('hs_bootstrap_local.sh'))

      // Determine effective Headscale URL (for local, read generated config)
      let effectiveHsUrl = HS_URL || ''
      if (!effectiveHsUrl && effectiveMode === 'local') {
        try {
          const cfgPath = path.join(srcDir, '_tmp', 'headscale', 'config.yaml')
          const text = fs.readFileSync(cfgPath, 'utf8')
          const m = text.match(/server_url:\s*(\S+)/)
          if (m) effectiveHsUrl = m[1]
        } catch {}
      }
      if (!effectiveHsUrl) send('warn', 'HEADSCALE_URL not found; tailscale join may fail')

      // If no TS auth key provided and using local mode, generate one via the headscale container
      let joinKey = TS_KEY || ''
      if (!joinKey && effectiveMode === 'local') {
        send('step', 'Generating Headscale preauth key (local)')
        const runDocker = async (args: string[]) =>
          await new Promise<string>((resolve, reject) => {
            const proc = spawn('docker', args, { env: process.env })
            let out = ''
            proc.stdout.on('data', (d) => (out += String(d)))
            proc.stderr.on('data', (d) => (out += String(d)))
            proc.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(out))))
          })
        try {
          await runDocker([
            'run',
            '--rm',
            '--network',
            'container:headscale-local',
            '-v',
            'headscale-data:/var/lib/headscale',
            '-v',
            `${path.join(srcDir, '_tmp', 'headscale')}` + ':/etc/headscale:ro',
            'headscale/headscale:0.26.1',
            '-c',
            '/etc/headscale/config.yaml',
            'users',
            'create',
            'default',
          ]).catch(() => '')
          const out = await runDocker([
            'run',
            '--rm',
            '--network',
            'container:headscale-local',
            '-v',
            'headscale-data:/var/lib/headscale',
            '-v',
            `${path.join(srcDir, '_tmp', 'headscale')}` + ':/etc/headscale:ro',
            'headscale/headscale:0.26.1',
            '-c',
            '/etc/headscale/config.yaml',
            'preauthkeys',
            'create',
            '--reusable',
            '--expiration',
            '48h',
            '--user',
            'default',
          ])
          const km = out.match(/key:\s*(tskey-[A-Za-z0-9]+)/)
          if (km) joinKey = km[1]
          if (!joinKey) throw new Error('failed to parse generated key')
          send('log', `Generated TS_AUTHKEY for local Headscale`)
        } catch (e) {
          send('stepError', String(e))
          throw e
        }
      }

      // 2) Join this host to tailnet (required for success)
      await runStep('Join tailnet', resolveScript('tailscale_join.sh'), [], {
        ...(effectiveHsUrl ? { HEADSCALE_URL: effectiveHsUrl } : {}),
        ...(joinKey ? { TS_AUTHKEY: joinKey } : {}),
      })
      try {
        const db = await getDB()
        await db.run(
          'INSERT INTO kv(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP',
          'tailscale_connected',
          '1'
        )
      } catch {}

      if (process.env.TEST_FAST_SETUP !== '1') {
        // 3) Per-org steps (DB-backed; UI should pass org, else use all stored)
        const orgs: string[] = []
        if (orgParam) orgs.push(orgParam)
        else {
          try {
            const db = await getDB()
            const rows: Array<{ name: string }> = await db.all(
              'SELECT name FROM orgs ORDER BY id ASC'
            )
            rows.forEach((r) => orgs.push(r.name))
          } catch {}
        }
        for (const o of orgs) {
          await runStep(`Talos org bootstrap (${o})`, resolveScript('talos_org_bootstrap.sh'), [o])
          await runStep(
            `Install Tailscale Operator (${o})`,
            resolveScript('install_tailscale_operator.sh'),
            [o]
          )
          await runStep(`Deploy demo app (${o})`, resolveScript('demo_app.sh'), [o])
        }

        // 4) Start orchestrator/dashboard
        await runStep('Start orchestrator + dashboard', resolveScript('start_orchestrator.sh'), [
          'up',
        ])
      }
      send('done', { ok: true })
    } else {
      // connect flow: join tailnet and start services; cluster must already exist
      await runStep('Join tailnet', resolveScript('tailscale_join.sh'))
      try {
        const db = await getDB()
        await db.run(
          'INSERT INTO kv(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP',
          'tailscale_connected',
          '1'
        )
      } catch {}
      if (process.env.TEST_FAST_SETUP !== '1') {
        // Optional: check kubeconfigs for common orgs and emit guidance
        const guessOrgs = ['acme', 'devrel']
        for (const o of guessOrgs) {
          const kc = path.join(process.env.HOME || '/root', '.kube', `${o}.config`)
          if (!fs.existsSync(kc)) send('hint', `Missing kubeconfig for org '${o}': ${kc}`)
        }
        await runStep('Start orchestrator + dashboard', resolveScript('start_orchestrator.sh'), [
          'up',
        ])
      }
      send('done', { ok: true })
    }
  } catch (e: any) {
    send('error', String(e && e.message ? e.message : e))
    send('done', { ok: false })
  } finally {
    res.end()
  }
})

// Validate setup prerequisites and env; returns guidance list
app.post('/api/setup/validate', (req, res) => {
  const presented = (req.headers['x-auth-token'] as string) || ''
  if (presented !== TOKEN) return res.status(401).json({ ok: false, error: 'unauthorized' })
  const issues: string[] = []
  const critical: string[] = []
  const add = (cond: any, msg: string, isCritical = false) => {
    if (!cond) (isCritical ? critical : issues).push(msg)
  }
  // Non-critical env hints
  add(process.env.DASHBOARD_TOKEN, 'DASHBOARD_TOKEN not set (using default)', false)
  add(
    process.env.ORCHESTRATOR_TOKEN,
    'ORCHESTRATOR_TOKEN not set (some features may be limited)',
    false
  )
  // Tailscale/Headscale (allow UI overrides)
  const body = (typeof req.body === 'object' && req.body) || {}
  const flow: 'create' | 'connect' = body.flow === 'create' ? 'create' : 'connect'
  const hsUrl = body.HEADSCALE_URL || ''
  const tsKey = body.TS_AUTHKEY || ''
  const tsHost = body.TS_HOSTNAME || ''
  // For connect, require HS URL + TS key + hostname
  if (flow === 'connect') {
    add(hsUrl, 'HEADSCALE_URL not set', true)
    add(tsKey, 'TS_AUTHKEY not set (or expired)', true)
    add(tsHost, 'TS_HOSTNAME not set', true)
  } else {
    // For create (local): only hostname is required; HS_URL and keys can be derived/generated
    add(tsHost, 'TS_HOSTNAME not set', true)
  }
  // Operator creds are configured elsewhere; not blocking setup here.
  res.json({ ok: critical.length === 0, issues: [...critical, ...issues] })
})

// ... existing streaming chat and SSE proxy endpoints kept in JS version (migrating incrementally) ...

if (import.meta.url === `file://${process.argv[1]}`) {
  // Load HTTPS certs for dev
  const here = path.dirname(new URL(import.meta.url).pathname)
  const certDir = path.resolve(here, '..', 'certs')
  const keyPath = path.join(certDir, 'dashboard.key')
  const crtPath = path.join(certDir, 'dashboard.crt')
  const httpsOpts = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(crtPath) }
  const server = https
    .createServer(httpsOpts, app)
    .listen(PORT, () => console.log(`dashboard (https) on :${PORT}`))
  server.on('upgrade', (req: any, socket, head) => {
    try {
      const url = new URL(req.url, 'http://localhost')
      if (UI_DEV && url.pathname.startsWith('/ui')) {
        const target = process.env.VITE_DEV_URL || 'http://localhost:5173'
        proxy.ws(req, socket, head, {
          target,
          changeOrigin: true,
          xfwd: true,
          headers: { origin: target },
          secure: false,
        })
        return
      }
      const m = url.pathname.match(/^\/embed\/local\/(\d+)(\/.*)?$/)
      if (m) {
        const port = Number(m[1])
        const rest = m[2] || '/'
        req.url = rest
        const target = `http://host.docker.internal:${port}`
        {
          const hdrs: any = { [CS_AUTH_HEADER]: CS_AUTH_TOKEN, origin: target }
          try {
            ;(req as any).headers['x-forwarded-proto'] = 'https'
          } catch {}
          proxy.ws(req, socket, head, {
            target,
            changeOrigin: true,
            xfwd: true,
            headers: hdrs,
            secure: false,
          })
        }
        return
      }
      const m2 = url.pathname.match(/^\/embed\/orchestrator\/(\d+)(\/.*)?$/)
      if (m2) {
        const port = Number(m2[1])
        const rest = m2[2] || '/'
        req.url = rest
        const orchBase = ORCH_URL.replace(/\/$/, '')
        const target = `${orchBase}/editor/proxy/${port}`
        {
          const wsOrigin = `http://127.0.0.1:${port}`
          const hdrs: any = Object.assign(
            { [CS_AUTH_HEADER]: CS_AUTH_TOKEN, origin: wsOrigin },
            ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
          )
          try {
            ;(req as any).headers['x-forwarded-proto'] = 'https'
          } catch {}
          proxy.ws(req, socket, head, {
            target,
            changeOrigin: true,
            xfwd: true,
            headers: hdrs,
            secure: false,
          })
        }
        return
      }
    } catch {}
    socket.destroy()
  })
}

export default app
