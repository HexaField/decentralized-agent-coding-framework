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

// Proxy schedule to orchestrator
app.post('/api/schedule', async (req,res)=>{
  try{
    const headers = Object.assign({}, ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {})
    const body = { org: req.body && req.body.org, task: req.body && req.body.task }
    if(!body.org || !body.task) return res.status(400).json({error:'missing org/task'})
    const out = await fetchJSON(`${ORCH_URL}/schedule`, { method:'POST', headers, body })
    res.json(out)
  }catch(e){ res.status(502).json({error:String(e)}) }
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
