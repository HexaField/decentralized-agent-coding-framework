import 'dotenv/config'
import express from 'express'
import path from 'path'
import fs from 'fs'
import http from 'http'
import https from 'https'
import httpProxy from 'http-proxy'

const app = express()
app.use(express.json())

const PORT = Number(process.env.PORT || 8090)
const TOKEN = process.env.DASHBOARD_TOKEN || 'dashboard-secret'
const ORCH_URL = process.env.ORCHESTRATOR_URL || 'http://mvp-orchestrator:8080'
const ORCH_TOKEN = process.env.ORCHESTRATOR_TOKEN || process.env.DASHBOARD_TOKEN || ''
const proxy = httpProxy.createProxyServer({ ws: true, changeOrigin: true, xfwd: true })

// Relax frame embedding for proxied responses
proxy.on('proxyRes', (proxyRes, req, res) => {
  try {
    delete (proxyRes as any).headers['x-frame-options']
    delete (proxyRes as any).headers['content-security-policy']
    res.setHeader('X-Frame-Options', 'ALLOWALL')
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
    if (req.method === 'OPTIONS') { res.status(204).end(); return }
  }
  next()
})

function fetchJSON(url: string, opts: { method?: string; headers?: Record<string, string>; body?: any } = {}): Promise<any>{
  return new Promise((resolve,reject)=>{
    const u = new URL(url)
    const lib = u.protocol === 'https:' ? https : http
    const req = lib.request({
      hostname: u.hostname,
      port: Number(u.port || (u.protocol==='https:'?443:80)),
      path: u.pathname + (u.search||''),
      method: opts.method||'GET',
      headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers||{})
    }, res=>{
      let data=''
      res.on('data', (d: any)=> data+=d)
      res.on('end', ()=>{
        try{ resolve(JSON.parse(data||'{}')) }catch(e){ reject(e) }
      })
    })
    req.on('error', reject)
    if(opts.body){ req.write(typeof opts.body==='string'? opts.body : JSON.stringify(opts.body)) }
    req.end()
  })
}

// In-memory chats
const chats: { global: Array<{role:'user'|'assistant'|'system', text:string}> } = { global: [] }
const agentChats: Record<string, Array<{role:'user'|'assistant'|'system', text:string}>> = {}

// __dirname replacement for ESM
const here = path.dirname(new URL(import.meta.url).pathname)
// If UI_DEV=1, proxy /ui to the Vite dev server (no build needed)
const UI_DEV = process.env.UI_DEV === '1'
if (UI_DEV) {
  const viteTarget = process.env.VITE_DEV_URL || 'http://localhost:5173'
  app.use('/ui', (req, res) => {
    proxy.web(req, res, { target: viteTarget, changeOrigin: true, xfwd: true })
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
  proxy.web(req, res, { target, changeOrigin: true, xfwd: true, headers: { origin: target } })
})

app.use((req,res,next)=>{
  const safe = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS'
  if(!safe){ if(req.headers['x-auth-token'] !== TOKEN) return res.status(401).json({error:'unauthorized'}) }
  next()
})

app.get('/api/health', (req,res)=> res.json({status:'ok'}))
app.get('/api/state', async (req,res)=>{
  try{
  const headers: Record<string,string> = ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
    const [tasks, agents] = await Promise.all([
      fetchJSON(`${ORCH_URL}/tasks`, { headers }),
      fetchJSON(`${ORCH_URL}/agents`, { headers }),
    ])
    let pr: any = null
    try{
      const p = path.join('/state','radicle','last_pr.json')
      if(fs.existsSync(p)) pr = JSON.parse(fs.readFileSync(p,'utf8'))
    }catch{}
    res.json({ tasks, agents, clusters: [], prs: pr? [pr]: [] })
  }catch(e){ res.status(200).json({ tasks: [], agents: [], clusters: [], prs: [], error: String(e) }) }
})

app.post('/api/command', (req,res)=>{ const q = (req.body&&req.body.q)||''; res.json({ok:true, echo:q}) })

// Chat APIs
app.get('/api/chat', (req,res)=>{ res.json({messages: chats.global}) })
app.post('/api/chat', async (req,res)=>{
  const org = (req.body && req.body.org) || 'acme'
  const text = (req.body && req.body.text) || ''
  chats.global.push({role:'user', text})
  try{
  const headers: Record<string,string> = ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
    const body = { org, task: text }
    const out = await fetchJSON(`${ORCH_URL}/schedule`, { method:'POST', headers, body })
    await fetchJSON(`${ORCH_URL}/agents/ensure`, { method:'POST', headers, body: { org, prompt: text } }).catch(()=>({}))
    chats.global.push({role:'system', text:`scheduled task ${out.id||''}`})
    res.json({ok:true, task: out})
  }catch(e){ res.status(502).json({error:String(e)}) }
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
    const out = await fetchJSON(`${ORCH_URL}/agents/logs?name=${encodeURIComponent(name)}`, { headers })
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
    // best-effort ensure agent
    await fetchJSON(`${ORCH_URL}/agents/ensure`, { method: 'POST', headers, body: { org, prompt: text } }).catch(() => ({}))
    send('message', 'Task scheduled and agent ensured.')
  } catch (e) {
    send('message', `Error: ${String(e)}`)
  }
  send('done', '1')
  res.end()
})

// ... existing streaming chat and SSE proxy endpoints kept in JS version (migrating incrementally) ...

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = app.listen(PORT, ()=> console.log(`dashboard on :${PORT}`))
  server.on('upgrade', (req: any, socket, head) => {
    try {
      const url = new URL(req.url, 'http://localhost')
      if (UI_DEV && url.pathname.startsWith('/ui')) {
        const target = process.env.VITE_DEV_URL || 'http://localhost:5173'
        proxy.ws(req, socket, head, { target, changeOrigin: true, xfwd: true, headers: { origin: target } })
        return
      }
      const m = url.pathname.match(/^\/embed\/local\/(\d+)(\/.*)?$/)
      if (m) {
        const port = Number(m[1])
        const rest = m[2] || '/'
        req.url = rest
        const target = `http://host.docker.internal:${port}`
        proxy.ws(req, socket, head, { target, changeOrigin: true, xfwd: true, headers: { origin: target } })
        return
      }
    } catch {}
    socket.destroy()
  })
}

export default app
