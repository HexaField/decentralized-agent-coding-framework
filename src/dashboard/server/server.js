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
  if(req.method !== 'GET'){
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

if (require.main === module) {
  app.listen(PORT, ()=> console.log(`dashboard on :${PORT}`))
}

module.exports = app
