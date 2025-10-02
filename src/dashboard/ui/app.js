async function main(){
  const h = await fetch('/api/health').then(r=>r.json())
  document.getElementById('health').textContent = JSON.stringify(h)
}
document.getElementById('run').onclick = async ()=>{
  const q = document.getElementById('cmd').value
  const res = await fetch('/api/command', {method:'POST', headers:{'Content-Type':'application/json','x-auth-token':(window.DASHBOARD_TOKEN||'dashboard-secret')}, body: JSON.stringify({q})}).then(r=>r.json())
  document.getElementById('out').textContent = JSON.stringify(res,null,2)
}
main()
