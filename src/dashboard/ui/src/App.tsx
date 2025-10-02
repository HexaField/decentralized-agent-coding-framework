import { createEffect, createSignal, For, Show } from 'solid-js'

// Determine server base URL. Prefer env override, else:
// - If running under Vite dev (port 5173), use same host on port 8090
// - Otherwise, same-origin
const SERVER_BASE = (() => {
  const anyEnv = (import.meta as any)?.env
  const fromEnv = anyEnv?.VITE_SERVER_URL as string | undefined
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const l = window.location
  if (l.port === '5173') return `${l.protocol}//${l.hostname}:8090`
  return `${l.protocol}//${l.host}`
})()

type Task = { id: string; status: string; text?: string }
type Agent = { name: string; status: string }

export default function App() {
  const [org, setOrg] = createSignal('acme')
  const [chatInput, setChatInput] = createSignal('')
  const [chatLog, setChatLog] = createSignal<string[]>([])
  const [tasks, setTasks] = createSignal<Task[]>([])
  const [agents, setAgents] = createSignal<Agent[]>([])
  const [expandedTasks, setExpandedTasks] = createSignal<Record<string, boolean>>({})
  const [expandedAgents, setExpandedAgents] = createSignal<Record<string, boolean>>({})
  const [editorSrc, setEditorSrc] = createSignal('about:blank')

  async function loadState() {
    try {
  const s = await fetch(`${SERVER_BASE}/api/state`).then((r) => r.json())
      setTasks((s.tasks || []).map((t: any) => ({ id: t.id || t.ID, status: t.status || t.Status, text: t.text || t.Text })))
      setAgents((s.agents || []).map((a: any) => ({ name: a.name || a.Name, status: a.status || a.Status })))
    } catch {}
  }

  createEffect(() => {
    loadState()
    const t = setInterval(loadState, 4000)
    return () => clearInterval(t)
  })

  function toggleTask(id: string, el: HTMLPreElement) {
    const cur = { ...expandedTasks() }
    cur[id] = !cur[id]
    setExpandedTasks(cur)
    if (cur[id]) startTaskStream(id, el)
  }

  function toggleAgent(name: string, el: HTMLPreElement) {
    const cur = { ...expandedAgents() }
    cur[name] = !cur[name]
    setExpandedAgents(cur)
    if (cur[name]) startAgentStream(name, el)
  }

  async function startTaskStream(id: string, pre: HTMLPreElement) {
    pre.textContent = ''
    try {
  const out = await fetch(`${SERVER_BASE}/api/taskLogs?id=${encodeURIComponent(id)}`).then((r) => r.json())
      pre.textContent = (out.lines || []).join('\n')
      pre.scrollTop = pre.scrollHeight
    } catch {}
  const es = new EventSource(`${SERVER_BASE}/api/stream/task?id=${encodeURIComponent(id)}`)
    es.onmessage = (e) => {
      pre.textContent += (pre.textContent ? '\n' : '') + e.data
      pre.scrollTop = pre.scrollHeight
    }
    es.onerror = () => es.close()
  }

  async function startAgentStream(name: string, pre: HTMLPreElement) {
    pre.textContent = ''
    try {
  const out = await fetch(`${SERVER_BASE}/api/agentLogs?name=${encodeURIComponent(name)}`).then((r) => r.json())
      pre.textContent = (out.lines || []).join('\n')
      pre.scrollTop = pre.scrollHeight
    } catch {}
  const es = new EventSource(`${SERVER_BASE}/api/stream/agent?name=${encodeURIComponent(name)}`)
    es.onmessage = (e) => {
      pre.textContent += (pre.textContent ? '\n' : '') + e.data
      pre.scrollTop = pre.scrollHeight
    }
    es.onerror = () => es.close()
  }

  function askLLM() {
    const text = chatInput().trim()
    if (!text) return
    setChatLog((prev) => [...prev, `[user] ${text}`])
    setChatInput('')
  const es = new EventSource(`${SERVER_BASE}/api/chat/stream?org=${encodeURIComponent(org())}&text=${encodeURIComponent(text)}`)
    es.addEventListener('message', (e) => setChatLog((prev) => [...prev, `[assistant] ${e.data}`]))
    es.addEventListener('task', (e) => {
      try {
        const info = JSON.parse((e as MessageEvent).data)
        setChatLog((prev) => [...prev, `[system] scheduled task ${info.id || ''}`])
      } catch {
        setChatLog((prev) => [...prev, `[system] ${(e as MessageEvent).data}`])
      }
      loadState()
    })
    es.addEventListener('done', () => es.close())
    es.addEventListener('error', () => es.close())
  }

  return (
    <div class="p-4 space-y-4">
      <div>
        <input class="border p-2" placeholder="org (e.g., acme)" value={org()} onInput={(e) => setOrg(e.currentTarget.value)} />
      </div>
      <section>
        <h2 class="text-xl font-semibold">Org Chat</h2>
        <div class="flex gap-2 items-center">
          <input class="flex-1 border p-2" placeholder="Describe your goal…" value={chatInput()} onInput={(e) => setChatInput(e.currentTarget.value)} />
          <button class="px-3 py-2 bg-blue-600 text-white rounded" onClick={askLLM}>Ask (LLM)</button>
        </div>
        <pre class="bg-slate-100 p-3 h-44 overflow-auto mt-2">{chatLog().join('\n')}</pre>
      </section>
      <section>
        <h2 class="text-xl font-semibold">Tasks</h2>
        <div class="space-y-2">
          <For each={tasks()}>
            {(t) => (
              <div class="border rounded">
                <div class="p-2 cursor-pointer" onClick={(e) => toggleTask(t.id, (e.currentTarget.nextSibling as HTMLDivElement).querySelector('pre') as HTMLPreElement)}>
                  [{t.id}] {t.status} — {t.text}
                </div>
                <Show when={expandedTasks()[t.id]}>
                  <div class="p-2"><pre class="bg-slate-100 p-2 h-40 overflow-auto" /></div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </section>
      <section>
        <h2 class="text-xl font-semibold">Agents</h2>
        <div class="space-y-2">
          <For each={agents()}>
            {(a) => (
              <div class="border rounded">
                <div class="p-2 cursor-pointer" onClick={(e) => toggleAgent(a.name, (e.currentTarget.nextSibling as HTMLDivElement).querySelector('pre') as HTMLPreElement)}>
                  {a.name} — {a.status}
                </div>
                <Show when={expandedAgents()[a.name]}>
                  <div class="p-2 space-y-2">
                    <div class="flex gap-2 items-center">
                      <input class="border p-2" placeholder="local port (e.g., 8450)" onKeyDown={(e) => {
                        if(e.key==='Enter'){
                          const p = (e.currentTarget as HTMLInputElement).value.trim(); if(p) setEditorSrc(`${SERVER_BASE}/embed/local/${encodeURIComponent(p)}/`)
                        }
                      }} />
                      <button class="px-3 py-2 bg-indigo-600 text-white rounded" onClick={(e)=>{
                        const input = (e.currentTarget.previousSibling as HTMLInputElement)
                        const p = input.value.trim(); if(p) setEditorSrc(`${SERVER_BASE}/embed/local/${encodeURIComponent(p)}/`)
                      }}>Open Editor</button>
                    </div>
                    <pre class="bg-slate-100 p-2 h-40 overflow-auto" />
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </section>
      <section>
        <h2 class="text-xl font-semibold">Editor</h2>
        <iframe class="w-full h-[70vh] border" src={editorSrc()} />
      </section>
    </div>
  )
}
