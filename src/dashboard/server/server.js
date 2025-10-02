const express = require('express')
const path = require('path')
const fs = require('fs')
const app = express()
app.use(express.json())

const PORT = process.env.PORT || 8090
const TOKEN = process.env.DASHBOARD_TOKEN || 'dashboard-secret'

app.use('/ui', express.static(path.join(__dirname, '..', 'ui')))

app.use((req,res,next)=>{
  if(req.method !== 'GET'){
    if(req.headers['x-auth-token'] !== TOKEN) return res.status(401).json({error:'unauthorized'})
  }
  next()
})

app.get('/api/health', (req,res)=> res.json({status:'ok'}))
app.get('/api/state', (req,res)=>{
  const state = {
    tasks: [], agents: [], clusters: [], prs: [],
  }
  res.json(state)
})

app.post('/api/command', (req,res)=>{
  const q = (req.body&&req.body.q)||''
  res.json({ok:true, echo:q})
})

app.listen(PORT, ()=> console.log(`dashboard on :${PORT}`))
