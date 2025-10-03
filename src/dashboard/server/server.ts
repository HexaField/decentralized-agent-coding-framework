import 'dotenv/config'
import express from 'express'
import path from 'path'
import fs from 'fs'
import http from 'http'
import https from 'https'
import httpProxy from 'http-proxy'
import { execFile } from 'child_process'

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
  const allowStar = ALLOW_ORIGINS.includes('*')
  const allowed = allowStar || (origin && ALLOW_ORIGINS.includes(origin))
  if (allowed) {
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Origin', allowStar ? '*' : origin)
    if (!allowStar) res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Auth-Token')
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
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
