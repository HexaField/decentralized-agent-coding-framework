async function main(){
  const h = await fetch('/api/health').then(r=>r.json())
  document.getElementById('health').textContent = JSON.stringify(h)
  const s = await fetch('/api/state').then(r=>r.json()).catch(()=>({tasks:[],prs:[]}))
  document.getElementById('tasks').textContent = JSON.stringify(s.tasks||[], null, 2)
  const pr = (s.prs && s.prs[0]) || null
  document.getElementById('pr').innerHTML = pr ? `<a href="${pr.url}" target="_blank">${pr.url}</a>` : '—'
  if(s.agents){
    let a = document.getElementById('agents')
    if(!a){
      const h2 = document.createElement('h2'); h2.textContent = 'Agents'; document.body.appendChild(h2)
      a = document.createElement('pre'); a.id='agents'; document.body.appendChild(a)
    }
    a.textContent = JSON.stringify(s.agents, null, 2)
  }
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
main()
