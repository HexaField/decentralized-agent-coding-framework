import { createEffect, createMemo, createSignal, For, Show, onCleanup } from 'solid-js'

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

// Types
type Task = { id: string; status: string; text?: string }
type Agent = { name: string; status: string; role?: string; currentTaskId?: string }

type Tab = 'Users' | 'Agents' | 'Projects' | 'Tasks' | 'Network'

export default function App() {
  // Global state
  const [activeTab, setActiveTab] = createSignal<Tab>('Agents')
  const [org, setOrg] = createSignal('acme')

  // Shared data
  const [tasks, setTasks] = createSignal<Task[]>([])
  const [agents, setAgents] = createSignal<Agent[]>([])

  // Global chat (collapsible right panel)
  const [isChatOpen, setIsChatOpen] = createSignal(true)
  const [chatInput, setChatInput] = createSignal('')
  const [chatLog, setChatLog] = createSignal<string[]>([])

  // Agent-specific prompt panel state
  const [agentPromptInput, setAgentPromptInput] = createSignal('')
  const [agentPromptLog, setAgentPromptLog] = createSignal<string[]>([])

  // Agents tab specifics
  const [selectedAgent, setSelectedAgent] = createSignal<string>('')
  const [editorPortInput, setEditorPortInput] = createSignal('')
  const editorSrc = createMemo(() => {
    if (!editorPortInput()) return 'about:blank'
    return `${SERVER_BASE}/embed/local/${encodeURIComponent(editorPortInput())}/`
  })

  // Logs SSE management
  let agentLogES: EventSource | null = null
  let taskLogES: EventSource | null = null

  function stopStreams() {
    if (agentLogES) { agentLogES.close(); agentLogES = null }
    if (taskLogES) { taskLogES.close(); taskLogES = null }
  }
  onCleanup(stopStreams)

  // Data loader
  async function loadState() {
    try {
      const s = await fetch(`${SERVER_BASE}/api/state`).then((r) => r.json())
      setTasks((s.tasks || []).map((t: any) => ({ id: t.id || t.ID, status: t.status || t.Status, text: t.text || t.Text })))
      setAgents((s.agents || []).map((a: any) => ({ name: a.name || a.Name, status: a.status || a.Status, role: a.role || a.Role, currentTaskId: a.taskId || a.TaskId })))
      // Default select first agent if none selected
      if (!selectedAgent() && (s.agents || []).length > 0) setSelectedAgent(s.agents[0].name || s.agents[0].Name)
    } catch {}
  }

  createEffect(() => {
    loadState()
    const t = setInterval(loadState, 4000)
    onCleanup(() => clearInterval(t))
  })

  // Global chat stream
  function askGlobalLLM() {
    const text = chatInput().trim()
    if (!text) return
    setChatLog((prev) => [...prev, `[user] ${text}`])
    setChatInput('')
    const es = new EventSource(`${SERVER_BASE}/api/chat/stream?org=${encodeURIComponent(org())}&text=${encodeURIComponent(text)}`)
    es.addEventListener('message', (e) => setChatLog((prev) => [...prev, `[assistant] ${(e as MessageEvent).data}`]))
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

  function askAgentLLM() {
    const text = agentPromptInput().trim()
    if (!text) return
    setAgentPromptLog((prev) => [...prev, `[user] ${text}`])
    setAgentPromptInput('')
    const es = new EventSource(`${SERVER_BASE}/api/chat/stream?org=${encodeURIComponent(org())}&text=${encodeURIComponent(text)}`)
    es.addEventListener('message', (e) => setAgentPromptLog((prev) => [...prev, `[assistant] ${(e as MessageEvent).data}`]))
    es.addEventListener('task', (e) => {
      try {
        const info = JSON.parse((e as MessageEvent).data)
        setAgentPromptLog((prev) => [...prev, `[system] scheduled task ${info.id || ''}`])
      } catch {
        setAgentPromptLog((prev) => [...prev, `[system] ${(e as MessageEvent).data}`])
      }
      loadState()
    })
    es.addEventListener('done', () => es.close())
    es.addEventListener('error', () => es.close())
  }

  // Agent logs stream management
  const [agentLogsText, setAgentLogsText] = createSignal('')
  async function startAgentStream(name: string) {
    setAgentLogsText('')
    try {
      const out = await fetch(`${SERVER_BASE}/api/agentLogs?name=${encodeURIComponent(name)}`).then((r) => r.json())
      setAgentLogsText((out.lines || []).join('\n'))
    } catch {}
    if (agentLogES) agentLogES.close()
    agentLogES = new EventSource(`${SERVER_BASE}/api/stream/agent?name=${encodeURIComponent(name)}`)
    agentLogES.onmessage = (e) => setAgentLogsText((prev) => (prev ? prev + '\n' : '') + e.data)
    agentLogES.onerror = () => { agentLogES?.close(); agentLogES = null }
  }

  // Task logs (for selected agent's current task if any)
  const [taskLogsText, setTaskLogsText] = createSignal('')
  async function startTaskStream(taskId: string) {
    setTaskLogsText('')
    try {
      const out = await fetch(`${SERVER_BASE}/api/taskLogs?id=${encodeURIComponent(taskId)}`).then((r) => r.json())
      setTaskLogsText((out.lines || []).join('\n'))
    } catch {}
    if (taskLogES) taskLogES.close()
    taskLogES = new EventSource(`${SERVER_BASE}/api/stream/task?id=${encodeURIComponent(taskId)}`)
    taskLogES.onmessage = (e) => setTaskLogsText((prev) => (prev ? prev + '\n' : '') + e.data)
    taskLogES.onerror = () => { taskLogES?.close(); taskLogES = null }
  }

  // When selected agent changes, wire up streams
  createEffect(() => {
    const name = selectedAgent()
    if (!name) return
    stopStreams()
    setAgentPromptLog([]) // reset panel for new agent
    startAgentStream(name)
    const a = agents().find((x) => x.name === name)
    if (a?.currentTaskId) startTaskStream(a.currentTaskId)
  })

  // UI helpers
  const tabs: Tab[] = ['Users', 'Agents', 'Projects', 'Tasks', 'Network']

  return (
    <div class="w-full h-screen flex flex-col">
      {/* Top navigation */}
      <header class="border-b p-3 flex items-center gap-2">
        <div class="font-semibold mr-4">Org:</div>
        <input class="border p-2 rounded" placeholder="org (e.g., acme)" value={org()} onInput={(e) => setOrg(e.currentTarget.value)} />
        <nav class="ml-auto flex gap-2">
          <For each={tabs}>{(t) => (
            <button class={`px-4 py-2 rounded border ${activeTab() === t ? 'bg-black text-white' : 'bg-white'}`} onClick={() => setActiveTab(t)}>
              {t}
            </button>
          )}</For>
        </nav>
        <button class="ml-2 px-3 py-2 border rounded" onClick={() => setIsChatOpen((v) => !v)}>{isChatOpen() ? '>' : '<'}</button>
      </header>

      {/* Main content area with optional right chat panel */}
      <div class="flex-1 grid" style={{
        display: 'grid',
        'grid-template-columns': isChatOpen() ? '1fr 340px' : '1fr',
        'grid-template-rows': '1fr',
        height: 'calc(100vh - 60px)'
      }}>
        {/* Center area by tab */}
        <main class="overflow-auto p-3">
          <Show when={activeTab()==='Agents'}>
            {/* Agents layout: left list, center editor, bottom logs+prompt */}
            <div class="grid gap-3" style={{ 'grid-template-columns': '280px 1fr', 'grid-template-rows': 'minmax(400px, 1fr) 260px' }}>
              {/* Left: agent list */}
              <aside class="border rounded p-2 overflow-auto" style={{ 'grid-row': '1 / span 2' }}>
                <div class="text-sm font-semibold mb-2">Agents</div>
                <For each={agents()}>
                  {(a) => (
                    <button class={`w-full text-left border rounded p-2 mb-2 ${selectedAgent()===a.name ? 'bg-slate-200' : ''}`} onClick={() => setSelectedAgent(a.name)}>
                      <div class="font-semibold">{a.name}</div>
                      <div class="text-sm opacity-70">{a.role || 'Coder'} — {a.status}</div>
                    </button>
                  )}
                </For>
              </aside>

              {/* Center: iframe editor */}
              <section class="border rounded overflow-hidden">
                <div class="p-2 flex items-center gap-2 border-b">
                  <input class="border p-2 rounded w-48" placeholder="local port (e.g., 8450)" value={editorPortInput()} onInput={(e)=> setEditorPortInput(e.currentTarget.value)} onKeyDown={(e)=>{ if(e.key==='Enter' && editorPortInput()) {/* src auto updates by memo */} }} />
                  <div class="text-sm opacity-70">Use port-forward or local editor port to embed.</div>
                </div>
                <iframe class="w-full h-full min-h-[400px]" src={editorSrc()} />
              </section>

              {/* Bottom: logs (left) and agent prompt (right) */}
              <section class="grid gap-3" style={{ 'grid-template-columns': '1fr 1fr' }}>
                <div class="border rounded overflow-hidden flex flex-col">
                  <div class="p-2 border-b font-semibold text-sm">[server] agent logs</div>
                  <pre class="flex-1 bg-slate-50 p-2 overflow-auto whitespace-pre-wrap">{agentLogsText()}</pre>
                </div>
                <div class="border rounded overflow-hidden flex flex-col">
                  <div class="p-2 border-b font-semibold text-sm">Prompt Agent</div>
                  <div class="p-2 flex gap-2 items-start">
                    <textarea class="border p-2 rounded w-full h-24" placeholder="Ask this agent to do something… (schedules a task for its org)" onInput={(e)=> setAgentPromptInput(e.currentTarget.value)} value={agentPromptInput()} />
                    <button class="px-3 py-2 bg-indigo-600 text-white rounded self-end" onClick={askAgentLLM}>Prompt</button>
                  </div>
                  <pre class="bg-slate-50 p-2 h-28 overflow-auto whitespace-pre-wrap">{agentPromptLog().join('\n')}</pre>
                </div>
              </section>
            </div>
          </Show>

          <Show when={activeTab()==='Tasks'}>
            <div class="space-y-2">
              <div class="text-sm font-semibold">Tasks</div>
              <For each={tasks()}>
                {(t) => (
                  <div class="border rounded p-2">
                    <div class="font-mono text-sm">[{t.id}] {t.status}</div>
                    <div class="opacity-70">{t.text}</div>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <Show when={activeTab()==='Users'}>
            <div class="text-sm opacity-70">Users view (coming soon)</div>
          </Show>
          <Show when={activeTab()==='Projects'}>
            <div class="text-sm opacity-70">Projects view (coming soon)</div>
          </Show>
          <Show when={activeTab()==='Network'}>
            <div class="text-sm opacity-70">Network view (coming soon)</div>
          </Show>
        </main>

        {/* Right: global chat panel */}
        <aside class="border-l p-3 flex flex-col" style={{ display: isChatOpen() ? 'flex' : 'none' }}>
          <div class="text-sm font-semibold mb-2">Global LLM Chat</div>
          <div class="flex-1 border rounded overflow-auto bg-slate-50 p-2 mb-2">
            <pre class="whitespace-pre-wrap">{chatLog().join('\n')}</pre>
          </div>
          <div class="flex gap-2 items-center">
            <input class="flex-1 border p-2 rounded" placeholder="Ask a question…" value={chatInput()} onInput={(e) => setChatInput(e.currentTarget.value)} />
            <button class="px-3 py-2 bg-blue-600 text-white rounded" onClick={askGlobalLLM}>Send</button>
          </div>
        </aside>
      </div>
    </div>
  )
}
