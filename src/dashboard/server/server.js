const express = require('express')
const path = require('path')
const fs = require('fs')
const http = require('http')
const https = require('https')
const app = express()
app.use(express.json())

const PORT = process.env.PORT || 8090
const TOKEN = process.env.DASHBOARD_TOKEN || 'dashboard-secret'
const ORCH_URL = process.env.ORCHESTRATOR_URL || 'http://mvp-orchestrator:8080'
const ORCH_TOKEN = process.env.ORCHESTRATOR_TOKEN || process.env.DASHBOARD_TOKEN || ''
const httpProxy = require('http-proxy')
const proxy = httpProxy.createProxyServer({ ws: true, changeOrigin: true, xfwd: true })
// LLM config (optional)
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'openai'
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com'

// Relax frame embedding for proxied responses
proxy.on('proxyRes', (proxyRes, req, res) => {
  try {
    delete proxyRes.headers['x-frame-options']
    delete proxyRes.headers['content-security-policy']
    // Allow embedding in dashboard origin
    res.setHeader('X-Frame-Options', 'ALLOWALL')
  } catch (_) {}
})
proxy.on('error', (err, req, res) => {
  try {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' })
    res.end('proxy error: ' + String(err))
  } catch (_) {}
})

function fetchJSON(url, opts={}){
  return new Promise((resolve,reject)=>{
    const u = new URL(url)
    const lib = u.protocol === 'https:' ? https : http
    const req = lib.request({
      hostname: u.hostname,
      port: u.port|| (u.protocol==='https:'?443:80),
      path: u.pathname + (u.search||''),
      method: opts.method||'GET',
      headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers||{})
    }, res=>{
      let data='';
      res.on('data', d=> data+=d)
      res.on('end', ()=>{
        try{ resolve(JSON.parse(data||'{}')) }catch(e){ reject(e) }
      })
    })
    req.on('error', reject)
    if(opts.body){ req.write(typeof opts.body==='string'? opts.body : JSON.stringify(opts.body)) }
    req.end()
  })
}

async function streamOpenAIChat({ org, userText, systemPrompt, onChunk, onDone }){
  if(!OPENAI_API_KEY){
    // fallback: simulate
    const sim = `Assistant (${org}): ${userText.substring(0,200)}`
    onChunk(sim); onDone(); return
  }
  const payload = {
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    stream: true,
    temperature: 0.2,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText }
    ]
  }
  const u = new URL('/v1/chat/completions', OPENAI_BASE_URL)
  const req = https.request({ hostname: u.hostname, port: u.port||443, path: u.pathname, method: 'POST', protocol: 'https:', headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${OPENAI_API_KEY}`
  }}, res => {
    res.setEncoding('utf8')
    res.on('data', chunk => {
      const lines = String(chunk).split(/\r?\n/) 
      for(const line of lines){
        const l = line.trim(); if(!l) continue
        if(!l.startsWith('data:')) continue
        const data = l.slice(5).trim()
        if(data === '[DONE]'){ onDone && onDone(); return }
        try{
          const j = JSON.parse(data)
          const delta = (((j.choices||[])[0]||{}).delta||{})
          if(delta.content){ onChunk && onChunk(delta.content) }
        }catch(_){ /* ignore */ }
      }
    })
    res.on('end', () => { onDone && onDone() })
  })
  req.on('error', _ => { onDone && onDone() })
  req.write(JSON.stringify(payload))
  req.end()
}

function buildOrgContext(org){
  // Lightweight org context from /state
  const ctx = []
  try{
    const p = path.join('/state','radicle','last_pr.json')
    if(fs.existsSync(p)){
      const j = JSON.parse(fs.readFileSync(p,'utf8'))
      if(j && j.url) ctx.push(`latest_pr: ${j.url}`)
    }
  }catch(_){}
  try{
    const repo = path.join('/state','demo-repo')
    if(fs.existsSync(repo)){
      const files = fs.readdirSync(repo).slice(0,20)
      ctx.push(`repo_files: ${files.join(', ')}`)
    }
  }catch(_){ }
  return ctx.join(' | ')
}

// In-memory chats
const chats = { global: [] } // {role:'user'|'agent', text}
const agentChats = {} // name -> [{role,text}]

app.use('/ui', express.static(path.join(__dirname, '..', 'ui')))

app.use((req,res,next)=>{
  // Allow safe methods without token
  const safe = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS'
  if(!safe){
    if(req.headers['x-auth-token'] !== TOKEN) return res.status(401).json({error:'unauthorized'})
  }
  next()
})

app.get('/api/health', (req,res)=> res.json({status:'ok'}))
app.get('/api/state', async (req,res)=>{
  try{
    const headers = ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
    const [tasks, agents] = await Promise.all([
      fetchJSON(`${ORCH_URL}/tasks`, { headers }),
      fetchJSON(`${ORCH_URL}/agents`, { headers }),
    ])
    let pr = null
    try{
      const p = path.join('/state','radicle','last_pr.json')
      if(fs.existsSync(p)) pr = JSON.parse(fs.readFileSync(p,'utf8'))
    }catch(e){ /* ignore */ }
    res.json({ tasks, agents, clusters: [], prs: pr? [pr]: [] })
  }catch(e){
    res.status(200).json({ tasks: [], agents: [], clusters: [], prs: [], error: String(e) })
  }
})

app.post('/api/command', (req,res)=>{
  const q = (req.body&&req.body.q)||''
  res.json({ok:true, echo:q})
})

// Chat APIs
app.get('/api/chat', (req,res)=>{ res.json({messages: chats.global}) })
app.post('/api/chat', async (req,res)=>{
  const org = req.body && req.body.org || 'acme'
  const text = req.body && req.body.text || ''
  chats.global.push({role:'user', text})
  // schedule a high-level task; agent may not exist yet
  try{
    // schedule task
    const headers = Object.assign({}, ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {})
    const body = { org, task: text }
    const out = await fetchJSON(`${ORCH_URL}/schedule`, { method:'POST', headers, body })
  // ask orchestrator to ensure an agent (dev mode)
  await fetchJSON(`${ORCH_URL}/agents/ensure`, { method:'POST', headers, body: { org, prompt: text } }).catch(()=>({}))
    chats.global.push({role:'system', text:`scheduled task ${out.id||''}`})
    res.json({ok:true, task: out})
  }catch(e){ res.status(502).json({error:String(e)}) }
})

// Streaming assistant (SSE): distinct from scheduler. The assistant may decide to create a task.
app.get('/api/chat/stream', async (req, res) => {
  const org = (req.query.org||'acme')+''
  const text = (req.query.text||'')+''
  if(!text) return res.status(400).end('missing text')
  // Prepare SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  const write = (event, data) => {
    if(event) res.write(`event: ${event}\n`)
    res.write(`data: ${data}\n\n`)
  }
  // Record user message
  chats.global.push({ role: 'user', text })
  // Simulated LLM with basic org-aware prefix and heuristic task detection
  const guard = `Guardrails: Only act within the scope of org ${org}. Do not take irreversible actions without explicit confirmation. When you want to request execution, prefix a single line with [[TASK]]: <action>.`
  const orgCtx = buildOrgContext(org)
  const systemPrompt = (process.env.CHAT_SYSTEM_PROMPT || `You are an assistant for org ${org}. Provide concise, actionable guidance.`)
    + (orgCtx? ` Context: ${orgCtx}.` : '')
    + ` ${guard}`
  let assistantFull = ''
  await streamOpenAIChat({ org, userText: text, systemPrompt,
    onChunk: (chunk)=>{ assistantFull += chunk; write('message', chunk) },
    onDone: ()=>{}
  })
  // Heuristic: schedule if user text implies or assistant emitted a [[TASK]] line
  const lower = (text + ' ' + assistantFull).toLowerCase()
  const explicitTaskMatch = assistantFull.match(/\[\[TASK\]\]:\s*(.+)/)
  const shouldSchedule = explicitTaskMatch || /build|implement|create|task|run|deploy/.test(lower)
  const taskText = explicitTaskMatch ? explicitTaskMatch[1] : text
  if(shouldSchedule){
    try{
      const headers = Object.assign({}, ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {})
      const body = { org, task: taskText }
      const out = await fetchJSON(`${ORCH_URL}/schedule`, { method:'POST', headers, body })
      write('task', JSON.stringify({ id: out.id||'', org }))
      chats.global.push({ role: 'system', text: `scheduled task ${out.id||''} from chat` })
    }catch(e){ write('error', JSON.stringify({ error: String(e) })) }
  }
  chats.global.push({ role: 'assistant', text: assistantFull })
  write('done', '1')
  res.end()
})

app.get('/api/agents/:name/chat', (req,res)=>{
  const name = req.params.name
  res.json({messages: agentChats[name]||[]})
})
app.post('/api/agents/:name/chat', async (req,res)=>{
  const name = req.params.name
  const org = req.body && req.body.org || 'acme'
  const text = req.body && req.body.text || ''
  if(!agentChats[name]) agentChats[name]=[]
  agentChats[name].push({role:'user', text})
  try{
    const headers = Object.assign({}, ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {})
    const body = { org, task: text, agentHint: name }
    const out = await fetchJSON(`${ORCH_URL}/schedule`, { method:'POST', headers, body })
  // ensure agent via orchestrator (dev mode)
  await fetchJSON(`${ORCH_URL}/agents/ensure`, { method:'POST', headers, body: { org, prompt: text } }).catch(()=>({}))
    agentChats[name].push({role:'system', text:`scheduled task ${out.id||''} for ${name}`})
    res.json({ok:true, task: out})
  }catch(e){ res.status(502).json({error:String(e)}) }
})

// Proxy schedule to orchestrator
app.post('/api/schedule', async (req,res)=>{
  try{
    const headers = Object.assign({}, ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {})
    const body = { org: req.body && req.body.org, task: req.body && req.body.task, agentHint: req.body && req.body.agentHint }
    if(!body.org || !body.task) return res.status(400).json({error:'missing org/task'})
    const out = await fetchJSON(`${ORCH_URL}/schedule`, { method:'POST', headers, body })
    res.json(out)
  }catch(e){ res.status(502).json({error:String(e)}) }
})

// Proxy logs
app.get('/api/taskLogs', async (req,res)=>{
  try{
    const id = req.query.id
    const headers = Object.assign({}, ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {})
    const out = await fetchJSON(`${ORCH_URL}/tasks/logs?id=${encodeURIComponent(id)}`, { headers })
    res.json(out)
  }catch(e){ res.status(502).json({error:String(e)}) }
})
app.get('/api/agentLogs', async (req,res)=>{
  try{
    const name = req.query.name
    const headers = Object.assign({}, ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {})
    const out = await fetchJSON(`${ORCH_URL}/agents/logs?name=${encodeURIComponent(name)}`, { headers })
    res.json(out)
  }catch(e){ res.status(502).json({error:String(e)}) }
})

// SSE proxy
app.get('/api/stream/task', (req,res)=>{
  const id = req.query.id
  if(!id) return res.status(400).end('missing id')
  const u = new URL(`${ORCH_URL}/events/tasks?id=${encodeURIComponent(id)}`)
  const reqx = http.request({ hostname: u.hostname, port: u.port||80, path: u.pathname+u.search, method: 'GET', headers: ORCH_TOKEN? {'X-Auth-Token': ORCH_TOKEN}: {} }, r=>{
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' })
    r.on('data', chunk=> res.write(chunk))
    r.on('end', ()=> res.end())
  })
  reqx.on('error', err=> res.status(502).end(String(err)))
  reqx.end()
})
app.get('/api/stream/agent', (req,res)=>{
  const name = req.query.name
  if(!name) return res.status(400).end('missing name')
  const u = new URL(`${ORCH_URL}/events/agents?name=${encodeURIComponent(name)}`)
  const reqx = http.request({ hostname: u.hostname, port: u.port||80, path: u.pathname+u.search, method: 'GET', headers: ORCH_TOKEN? {'X-Auth-Token': ORCH_TOKEN}: {} }, r=>{
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' })
    r.on('data', chunk=> res.write(chunk))
    r.on('end', ()=> res.end())
  })
  reqx.on('error', err=> res.status(502).end(String(err)))
  reqx.end()
})

// Lightweight probe to check if a local port-forward is up
app.get('/api/embed/ping/:port', (req,res)=>{
  const port = Number(req.params.port)
  if(!port || port < 1 || port > 65535) return res.status(400).json({error:'invalid port'})
  const opts = { hostname: 'host.docker.internal', port, path: '/', method: 'HEAD' }
  const reqx = http.request(opts, r=>{ res.json({ ok: r.statusCode, headers: r.headers }) })
  reqx.on('error', err=> res.status(502).json({ error: String(err) }))
  reqx.end()
})

// Proxy code-server via dashboard origin to allow iframe embedding
app.all('/embed/local/:port/*', (req,res)=>{
  const port = Number(req.params.port)
  if(!port || port < 1 || port > 65535) return res.status(400).send('invalid port')
  const target = `http://host.docker.internal:${port}`
  req.url = req.originalUrl.replace(`/embed/local/${req.params.port}`, '') || '/'
  proxy.web(req, res, { target, changeOrigin: true, xfwd: true, headers: { origin: target } }, err=>{
    res.status(502).send(String(err))
  })
})

// Also handle exact root without trailing path
app.all('/embed/local/:port', (req,res)=>{
  const port = Number(req.params.port)
  if(!port || port < 1 || port > 65535) return res.status(400).send('invalid port')
  const target = `http://host.docker.internal:${port}`
  req.url = '/'
  proxy.web(req, res, { target, changeOrigin: true, xfwd: true, headers: { origin: target } }, err=>{
    res.status(502).send(String(err))
  })
})

if (require.main === module) {
  const server = app.listen(PORT, ()=> console.log(`dashboard on :${PORT}`))
  // Proxy WebSocket upgrades for embed routes
  server.on('upgrade', (req, socket, head) => {
    try {
      const url = new URL(req.url, 'http://localhost')
      const m = url.pathname.match(/^\/embed\/local\/(\d+)(\/.*)?$/)
      if (m) {
        const port = Number(m[1])
        const rest = m[2] || '/'
        req.url = rest
  const target = `http://host.docker.internal:${port}`
  proxy.ws(req, socket, head, { target, changeOrigin: true, xfwd: true, headers: { origin: target } })
        return
      }
    } catch (_) {}
    socket.destroy()
  })
}

module.exports = app
