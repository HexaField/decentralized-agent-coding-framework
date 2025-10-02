// Simplified dashboard UI logic: org chat (LLM), expandable tasks, expandable agents with editor open

const embedFrame = document.getElementById('embedFrame')

let refreshTimer = null
const expandedTasks = new Set()
const expandedAgents = new Set()
const taskStreams = new Map() // id -> EventSource
const agentStreams = new Map() // name -> EventSource

async function loadState(){
  const h = await fetch('/api/health').then(r=>r.json()).catch(()=>({status:'error'}))
  document.getElementById('health').textContent = JSON.stringify(h)
  const s = await fetch('/api/state').then(r=>r.json()).catch(()=>({tasks:[],agents:[]}))
  renderTasks(s.tasks||[])
  renderAgents(s.agents||[])
}

function renderTasks(tasks){
  const root = document.getElementById('tasksList')
  root.textContent = ''
  tasks.forEach(t=>{
    const id = t.id || t.ID || t.Id
    const status = t.status || t.Status || 'unknown'
    const text = t.text || t.Text || ''
    const el = document.createElement('div')
    const header = document.createElement('div')
    header.className = 'item-header'
    header.textContent = `[${id}] ${status} — ${text}`
    const body = document.createElement('div')
    body.style.display = expandedTasks.has(id) ? 'block' : 'none'
    const pre = document.createElement('pre')
    pre.style.height = '160px'; pre.style.overflow = 'auto'
    pre.id = `taskLog-${id}`
    body.appendChild(pre)
    header.onclick = async ()=>{
      if(expandedTasks.has(id)){
        expandedTasks.delete(id)
        body.style.display = 'none'
        const es = taskStreams.get(id); if(es){ es.close(); taskStreams.delete(id) }
      } else {
        expandedTasks.add(id)
        body.style.display = 'block'
        await startTaskStream(id, pre)
      }
    }
    el.appendChild(header); el.appendChild(body)
    root.appendChild(el)
  })
}

async function startTaskStream(id, pre){
  pre.textContent = ''
  const out = await fetch(`/api/taskLogs?id=${encodeURIComponent(id)}`).then(r=>r.json()).catch(()=>({lines:[]}))
  pre.textContent = (out.lines||[]).join('\n'); pre.scrollTop = pre.scrollHeight
  let es = taskStreams.get(id); if(es){ es.close() }
  es = new EventSource(`/api/stream/task?id=${encodeURIComponent(id)}`)
  es.onmessage = (e)=>{ pre.textContent += (pre.textContent?'\n':'') + e.data; pre.scrollTop = pre.scrollHeight }
  es.onerror = ()=>{ es.close(); taskStreams.delete(id) }
  taskStreams.set(id, es)
}

function renderAgents(agents){
  const root = document.getElementById('agentsList')
  root.textContent = ''
  agents.forEach(a=>{
    const name = a.name || a.Name
    const status = a.status || a.Status || 'unknown'
    const el = document.createElement('div')
    const header = document.createElement('div')
    header.className = 'item-header'
    header.textContent = `${name} — ${status}`
    const body = document.createElement('div')
    body.style.display = expandedAgents.has(name) ? 'block' : 'none'
    const ctrl = document.createElement('div')
    ctrl.className = 'row'
    const port = document.createElement('input'); port.placeholder = 'local port (e.g., 8450)'
    const btn = document.createElement('button'); btn.textContent = 'Open Editor'
    btn.onclick = ()=>{ const p = port.value.trim(); if(!p) return; embedFrame.src = `/embed/local/${encodeURIComponent(p)}/` }
    ctrl.appendChild(port); ctrl.appendChild(btn)
    const pre = document.createElement('pre'); pre.style.height='160px'; pre.style.overflow='auto'; pre.id=`agentLog-${name}`
    body.appendChild(ctrl); body.appendChild(pre)
    header.onclick = async ()=>{
      if(expandedAgents.has(name)){
        expandedAgents.delete(name); body.style.display='none'
        const es = agentStreams.get(name); if(es){ es.close(); agentStreams.delete(name) }
      } else {
        expandedAgents.add(name); body.style.display='block'
        await startAgentStream(name, pre)
      }
    }
    el.appendChild(header); el.appendChild(body); root.appendChild(el)
  })
}

async function startAgentStream(name, pre){
  pre.textContent = ''
  const out = await fetch(`/api/agentLogs?name=${encodeURIComponent(name)}`).then(r=>r.json()).catch(()=>({lines:[]}))
  pre.textContent = (out.lines||[]).join('\n'); pre.scrollTop = pre.scrollHeight
  let es = agentStreams.get(name); if(es){ es.close() }
  es = new EventSource(`/api/stream/agent?name=${encodeURIComponent(name)}`)
  es.onmessage = (e)=>{ pre.textContent += (pre.textContent?'\n':'') + e.data; pre.scrollTop = pre.scrollHeight }
  es.onerror = ()=>{ es.close(); agentStreams.delete(name) }
  agentStreams.set(name, es)
}

// Org chat streaming
document.getElementById('chatAsk').onclick = async ()=>{
  const input = document.getElementById('chatInput')
  const text = input.value.trim()
  const org = document.getElementById('org').value.trim() || 'acme'
  if(!text) return
  const pre = document.getElementById('chatLog')
  pre.textContent += (pre.textContent? '\n':'') + `[user] ${text}`
  input.value=''
  const es = new EventSource(`/api/chat/stream?org=${encodeURIComponent(org)}&text=${encodeURIComponent(text)}`)
  es.addEventListener('message', (e)=>{ pre.textContent += `\n[assistant] ${e.data}`; pre.scrollTop = pre.scrollHeight })
  es.addEventListener('task', (e)=>{ 
    try{ const info = JSON.parse(e.data); pre.textContent += `\n[system] scheduled task ${info.id||''}` }
    catch(_){ pre.textContent += `\n[system] ${e.data}` }
    pre.scrollTop = pre.scrollHeight 
  })
  es.addEventListener('done', ()=>{ es.close(); loadState() })
  es.addEventListener('error', ()=>{ es.close() })
}

async function main(){ await loadState(); if(!refreshTimer){ refreshTimer = setInterval(loadState, 4000) } }
window.addEventListener('beforeunload', ()=>{ taskStreams.forEach(es=>es.close()); agentStreams.forEach(es=>es.close()) })
main()
