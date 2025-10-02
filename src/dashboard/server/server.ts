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

app.use('/ui', express.static(path.join(__dirname, '..', 'ui')))

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

// ... existing streaming chat and SSE proxy endpoints kept in JS version (migrating incrementally) ...

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = app.listen(PORT, ()=> console.log(`dashboard on :${PORT}`))
  server.on('upgrade', (req: any, socket, head) => {
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
    } catch {}
    socket.destroy()
  })
}

export default app
