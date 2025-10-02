async function main(){
  const h = await fetch('/api/health').then(r=>r.json())
  document.getElementById('health').textContent = JSON.stringify(h)
  const s = await fetch('/api/state').then(r=>r.json()).catch(()=>({tasks:[],prs:[]}))
  document.getElementById('tasks').textContent = JSON.stringify(s.tasks||[], null, 2)
  const pr = (s.prs && s.prs[0]) || null
  document.getElementById('pr').innerHTML = pr ? `<a href="${pr.url}" target="_blank">${pr.url}</a>` : '—'
  renderAgentsTabs(s.agents||[])
}
document.getElementById('run').onclick = async ()=>{
  const q = document.getElementById('cmd').value
  const res = await fetch('/api/command', {method:'POST', headers:{'Content-Type':'application/json','x-auth-token':(window.DASHBOARD_TOKEN||'dashboard-secret')}, body: JSON.stringify({q})}).then(r=>r.json())
  document.getElementById('out').textContent = JSON.stringify(res,null,2)
}
document.getElementById('refresh').onclick = main
document.getElementById('schedule').onclick = async ()=>{
  const org = document.getElementById('org').value.trim()
  const task = document.getElementById('task').value.trim()
  const res = await fetch('/api/schedule', {method:'POST', headers:{'Content-Type':'application/json','x-auth-token':(window.DASHBOARD_TOKEN||'dashboard-secret')}, body: JSON.stringify({org, task})}).then(r=>r.json())
  document.getElementById('scheduleOut').textContent = JSON.stringify(res, null, 2)
  await main()
}

// Embed controls
const embedFrame = document.getElementById('embedFrame')
document.getElementById('embedLoad').onclick = ()=>{
  const p = document.getElementById('embedPort').value.trim()
  if(!p){ document.getElementById('embedStatus').textContent = 'Enter a local port'; return }
  embedFrame.src = `/embed/local/${encodeURIComponent(p)}/`
}
document.getElementById('embedPing').onclick = async ()=>{
  const p = document.getElementById('embedPort').value.trim()
  if(!p){ document.getElementById('embedStatus').textContent = 'Enter a local port'; return }
  const r = await fetch(`/api/embed/ping/${encodeURIComponent(p)}`).then(r=>r.json()).catch(e=>({error:String(e)}))
  document.getElementById('embedStatus').textContent = JSON.stringify(r, null, 2)
}

// Agents tabs + logs + invoke
let activeAgent = null
let activeTaskId = null
let refreshTimer = null

function renderAgentsTabs(agents){
  const tabs = document.getElementById('agentsTabs')
  tabs.textContent = ''
  agents.forEach(a=>{
    const btn = document.createElement('button')
    btn.textContent = `${a.name||a.Name||'agent'} (${a.status||a.Status||'?'})`
    btn.onclick = ()=>{ activeAgent = a.name||a.Name; activeTaskId = null; loadAgentLogs(); }
    tabs.appendChild(btn)
  })
  if(activeAgent && !agents.find(a=> (a.name||a.Name) === activeAgent)) activeAgent = null
  if(!refreshTimer){ refreshTimer = setInterval(tick, 2000) }
}

async function tick(){
  await main() // refresh tasks/agents
  if(activeAgent){ await loadAgentLogs() }
  if(activeTaskId){ await loadTaskLogs(activeTaskId) }
}

async function loadAgentLogs(){
  const name = activeAgent; if(!name) return
  const out = await fetch(`/api/agentLogs?name=${encodeURIComponent(name)}`).then(r=>r.json()).catch(()=>({lines:[]}))
  document.getElementById('agentLogs').textContent = (out.lines||[]).join('\n')
}

async function loadTaskLogs(id){
  const out = await fetch(`/api/taskLogs?id=${encodeURIComponent(id)}`).then(r=>r.json()).catch(()=>({lines:[]}))
  document.getElementById('taskLogs').textContent = (out.lines||[]).join('\n')
}

document.getElementById('agentInvoke').onclick = async ()=>{
  const name = activeAgent
  const org = document.getElementById('org').value.trim() || 'acme'
  const prompt = document.getElementById('agentPrompt').value.trim()
  if(!name || !prompt){ alert('Select an agent and enter a prompt'); return }
  const res = await fetch('/api/schedule', {method:'POST', headers:{'Content-Type':'application/json','x-auth-token':(window.DASHBOARD_TOKEN||'dashboard-secret')}, body: JSON.stringify({org, task: prompt, agentHint: name})}).then(r=>r.json())
  document.getElementById('scheduleOut').textContent = JSON.stringify(res,null,2)
  activeTaskId = res.id || null
  if(activeTaskId){ loadTaskLogs(activeTaskId) }
}

// Global chat
async function refreshGlobalChat(){
  const data = await fetch('/api/chat').then(r=>r.json()).catch(()=>({messages:[]}))
  const lines = (data.messages||[]).map(m=>`[${m.role}] ${m.text}`)
  document.getElementById('globalChat').textContent = lines.join('\n')
}
document.getElementById('globalChatSend').onclick = async ()=>{
  const text = document.getElementById('globalChatInput').value.trim()
  const org = document.getElementById('org').value.trim() || 'acme'
  if(!text) return
  const res = await fetch('/api/chat', {method:'POST', headers:{'Content-Type':'application/json','x-auth-token':(window.DASHBOARD_TOKEN||'dashboard-secret')}, body: JSON.stringify({org, text})}).then(r=>r.json()).catch(e=>({error:String(e)}))
  document.getElementById('scheduleOut').textContent = JSON.stringify(res,null,2)
  await refreshGlobalChat(); await main()
}
setInterval(refreshGlobalChat, 3000)
main()
