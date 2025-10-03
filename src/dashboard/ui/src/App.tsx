import { createEffect, createMemo, createSignal, For, Show, onCleanup, onMount } from 'solid-js'
import OrgSelect from './components/OrgSelect'
import OrgManager from './components/OrgManager'
import SetupWizard from './components/SetupWizard'
import OrgWizard from './components/OrgWizard'

// Determine server base URL. Prefer env override, else:
// - If running under Vite dev (port 5173), use same host on port 8090
// - Otherwise, same-origin
const SERVER_BASE = (() => {
  const fromEnv = import.meta.env.VITE_SERVER_URL
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const l = window.location
  if (l.port === '5173') return `https://${l.hostname}:8090`
  return `${l.protocol}//${l.host}`
})()

// Dev debug stream
const isDev = true //Boolean((import.meta as any)?.env?.DEV)

// Types
type Task = { id: string; status: string; text?: string }
type Agent = {
  name: string
  status: string
  role?: string
  currentTaskId?: string
  editorPort?: number | string
  port?: number | string
  editorVia?: string
}

type Tab = 'Users' | 'Agents' | 'Projects' | 'Tasks' | 'Network'

export default function App() {
  // Global state
  const [activeTab, setActiveTab] = createSignal<Tab>('Agents')
  const [org, setOrg] = createSignal('')
  const [orgs, setOrgs] = createSignal<string[]>([])
  const [showSetup, setShowSetup] = createSignal<'none' | 'create' | 'connect'>('none')
  const [showOrgManager, setShowOrgManager] = createSignal(false)
  const [checking, setChecking] = createSignal(true)
  const [showOrgWizard, setShowOrgWizard] = createSignal(false)
  const [validated, setValidated] = createSignal(false)
  // reserved for future TS checks; validated gate covers it for now
  const dashboardToken = import.meta.env.VITE_DASHBOARD_TOKEN

  // Theme state: 'light' | 'dark' | 'system'
  type Theme = 'light' | 'dark' | 'system'
  const [theme, setTheme] = createSignal<Theme>('system')
  let media: MediaQueryList | null = null

  function applyTheme(t: Theme) {
    const root = document.documentElement
    if (t === 'light') {
      root.classList.remove('dark')
    } else if (t === 'dark') {
      root.classList.add('dark')
    } else {
      const prefersDark =
        window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      if (prefersDark) root.classList.add('dark')
      else root.classList.remove('dark')
    }
  }

  onMount(() => {
    try {
      const stored = localStorage.getItem('theme') as Theme | null
      if (stored === 'light' || stored === 'dark' || stored === 'system') setTheme(stored)
    } catch {}
    // media listener for system changes when in system mode
    if (window.matchMedia) {
      media = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => {
        if (theme() === 'system') applyTheme('system')
      }
      media.addEventListener?.('change', handler)
      onCleanup(() => media?.removeEventListener?.('change', handler))
    }
    applyTheme(theme())
  })

  createEffect(() => {
    const t = theme()
    try {
      localStorage.setItem('theme', t)
    } catch {}
    applyTheme(t)
  })

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
  const [debugLines, setDebugLines] = createSignal<string[]>([])
  createEffect(() => {
    if (!isDev) return
    const es = new EventSource(`${SERVER_BASE}/api/debug/stream`)
    es.addEventListener('config', (e) =>
      setDebugLines((p) => [...p, `[config] ${(e as MessageEvent).data}`])
    )
    es.addEventListener('status', (e) =>
      setDebugLines((p) => [...p, `[status] ${(e as MessageEvent).data}`])
    )
    es.addEventListener('health', (e) =>
      setDebugLines((p) => [...p, `[health] ${(e as MessageEvent).data}`])
    )
    es.addEventListener('state', (e) =>
      setDebugLines((p) => [...p, `[state] ${(e as MessageEvent).data}`])
    )
    es.addEventListener('heartbeat', (e) =>
      setDebugLines((p) => [...p, `[hb] ${(e as MessageEvent).data}`])
    )
    es.addEventListener('error', (e) =>
      setDebugLines((p) => [...p, `[error] ${(e as MessageEvent).data}`])
    )
    return () => es.close()
  })

  async function manualEnsure() {
    try {
      const res = await fetch(`${SERVER_BASE}/api/debug/ensure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': import.meta.env.VITE_DASHBOARD_TOKEN,
        },
        body: JSON.stringify({ org: org(), prompt: 'ensure via debug' }),
      })
      const json = await res.json()
      setDebugLines((p) => [...p, `[ensure] ${JSON.stringify(json)}`])
    } catch (e: any) {
      setDebugLines((p) => [...p, `[ensure-error] ${String(e)}`])
    }
  }

  const editorSrc = createMemo(() => {
    const name = selectedAgent()
    if (!name) return 'about:blank'
    const a = agents().find((x) => x.name === name)
    const p = a?.editorPort ?? a?.port
    if (!p) return 'about:blank'
    const via = a?.editorVia
    if (via === 'orchestrator')
      return `${SERVER_BASE}/embed/orchestrator/${encodeURIComponent(String(p))}/`
    return `${SERVER_BASE}/embed/local/${encodeURIComponent(String(p))}/`
  })
  const selectedAgentPort = createMemo(() => {
    const name = selectedAgent()
    if (!name) return ''
    const a = agents().find((x) => x.name === name)
    const p = a?.editorPort ?? a?.port
    return p ? String(p) : ''
  })

  // If the proxied editor returns an error, auto-attempt to (re)open via orchestrator and reload iframe
  const [iframeBust, setIframeBust] = createSignal('')
  createEffect(() => {
    const src = editorSrc()
    const name = selectedAgent()
    if (!name || !src || src === 'about:blank') return
    ;(async () => {
      try {
        // Lightweight probe of the proxied root; same-origin so status is readable
        const r = await fetch(src, { method: 'GET', cache: 'no-store', redirect: 'manual' })
        if (r.status >= 500) throw new Error('embed 5xx')
      } catch {
        try {
          await fetch(`${SERVER_BASE}/api/editor/open`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, org: org() }),
          })
          // give orchestrator a moment to bind, refresh state, and force iframe reload
          setTimeout(() => {
            loadState()
            setIframeBust(`?t=${Date.now()}`)
          }, 1200)
        } catch {}
      }
    })()
  })

  // Logs SSE management
  let agentLogES: EventSource | null = null
  let taskLogES: EventSource | null = null

  function stopStreams() {
    if (agentLogES) {
      agentLogES.close()
      agentLogES = null
    }
    if (taskLogES) {
      taskLogES.close()
      taskLogES = null
    }
  }
  onCleanup(stopStreams)

  // Data loader
  async function loadState() {
    try {
      const s = await fetch(`${SERVER_BASE}/api/state`).then((r) => r.json())
      setTasks(
        (s.tasks || []).map((t: any) => ({
          id: t.id || t.ID,
          status: t.status || t.Status,
          text: t.text || t.Text,
        }))
      )
      setAgents(
        (s.agents || []).map((a: any) => ({
          name: a.name || a.Name,
          status: a.status || a.Status,
          role: a.role || a.Role,
          currentTaskId: a.taskId || a.TaskId,
          editorPort: a.editorPort || a.EditorPort || a.port || a.Port,
          editorVia: a.editorVia || a.EditorVia,
        }))
      )
      // Default select first agent if none selected
      if (!selectedAgent() && (s.agents || []).length > 0)
        setSelectedAgent(s.agents[0].name || s.agents[0].Name)
    } catch {}
  }

  createEffect(() => {
    loadState()
    const t = setInterval(loadState, 4000)
    onCleanup(() => clearInterval(t))
  })

  // Gating: check server status for tailscale connectivity
  async function validateAndDetect() {
    try {
      setChecking(true)
      const s = await fetch(`${SERVER_BASE}/api/setup/status`).then((r) => r.json())
      setValidated(Boolean(s.connected))
      if (!s.connected) setShowSetup('connect')
    } catch {
      setValidated(false)
    } finally {
      setChecking(false)
    }
  }
  onMount(async () => {
    validateAndDetect()
    try {
      const r = await fetch(`${SERVER_BASE}/api/orgs`).then((x) => x.json())
      const names = (r.orgs || []).map((o: any) => o.name)
      setOrgs(names)
      if (!org() && names.length > 0) setOrg(names[0])
    } catch {}
  })

  // Optional: could fetch org-specific status here; do not auto-open setup wizard

  // Global chat stream
  function askGlobalLLM() {
    const text = chatInput().trim()
    if (!text) return
    setChatLog((prev) => [...prev, `[user] ${text}`])
    setChatInput('')
    const es = new EventSource(
      `${SERVER_BASE}/api/chat/stream?org=${encodeURIComponent(org())}&text=${encodeURIComponent(text)}`
    )
    es.addEventListener('message', (e) =>
      setChatLog((prev) => [...prev, `[assistant] ${(e as MessageEvent).data}`])
    )
    es.addEventListener('task', (e) => {
      try {
        const info = JSON.parse((e as MessageEvent).data)
        setChatLog((prev) => [...prev, `[system] scheduled task ${info.id || ''}`])
      } catch {
        setChatLog((prev) => [...prev, `[system] ${(e as MessageEvent).data}`])
      }
      loadState()
    })
    es.addEventListener('ensure', (e) => {
      setChatLog((prev) => [...prev, `[system] ensure: ${(e as MessageEvent).data}`])
      setTimeout(loadState, 1500)
    })
    es.addEventListener('done', () => es.close())
    es.addEventListener('error', () => es.close())
    setTimeout(loadState, 1500)
  }

  function askAgentLLM() {
    const text = agentPromptInput().trim()
    if (!text) return
    setAgentPromptLog((prev) => [...prev, `[user] ${text}`])
    setAgentPromptInput('')
    const es = new EventSource(
      `${SERVER_BASE}/api/chat/stream?org=${encodeURIComponent(org())}&text=${encodeURIComponent(text)}`
    )
    es.addEventListener('message', (e) =>
      setAgentPromptLog((prev) => [...prev, `[assistant] ${(e as MessageEvent).data}`])
    )
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
      const out = await fetch(`${SERVER_BASE}/api/agentLogs?name=${encodeURIComponent(name)}`).then(
        (r) => r.json()
      )
      setAgentLogsText((out.lines || []).join('\n'))
    } catch {}
    if (agentLogES) agentLogES.close()
    agentLogES = new EventSource(`${SERVER_BASE}/api/stream/agent?name=${encodeURIComponent(name)}`)
    agentLogES.onmessage = (e) => setAgentLogsText((prev) => (prev ? prev + '\n' : '') + e.data)
    agentLogES.onerror = () => {
      agentLogES?.close()
      agentLogES = null
    }
  }

  // Task logs (for selected agent's current task if any)
  const [taskLogsText, setTaskLogsText] = createSignal('')
  async function startTaskStream(taskId: string) {
    setTaskLogsText('')
    try {
      const out = await fetch(`${SERVER_BASE}/api/taskLogs?id=${encodeURIComponent(taskId)}`).then(
        (r) => r.json()
      )
      setTaskLogsText((out.lines || []).join('\n'))
    } catch {}
    if (taskLogES) taskLogES.close()
    taskLogES = new EventSource(`${SERVER_BASE}/api/stream/task?id=${encodeURIComponent(taskId)}`)
    taskLogES.onmessage = (e) => setTaskLogsText((prev) => (prev ? prev + '\n' : '') + e.data)
    taskLogES.onerror = () => {
      taskLogES?.close()
      taskLogES = null
    }
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
      <header class="border-b p-3 flex items-center gap-2 bg-white dark:bg-slate-900 dark:border-slate-700">
        <OrgSelect
          orgs={orgs()}
          value={org()}
          onChange={(o) => setOrg(o)}
          onCreateNew={() => setShowOrgWizard(true)}
        />
        <nav class="ml-auto flex gap-2">
          <button
            class={`px-4 py-2 rounded border dark:border-slate-700 bg-white dark:bg-slate-800 dark:text-slate-100`}
            onClick={() => setShowOrgManager(true)}
          >
            Orgs
          </button>
          <For each={tabs}>
            {(t) => (
              <button
                class={`px-4 py-2 rounded border dark:border-slate-700 ${activeTab() === t ? 'bg-black text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-white dark:bg-slate-800 dark:text-slate-100'}`}
                onClick={() => setActiveTab(t)}
              >
                {t}
              </button>
            )}
          </For>
        </nav>
        {/* Theme switcher */}
        <div class="ml-2 flex items-center gap-2">
          <label class="text-sm opacity-70 dark:text-slate-300">Theme</label>
          <select
            class="border rounded p-2 bg-white dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700"
            value={theme()}
            onChange={(e) => setTheme(e.currentTarget.value as Theme)}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">System</option>
          </select>
        </div>
        <button
          class="ml-2 px-3 py-2 border rounded dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          onClick={() => setIsChatOpen((v) => !v)}
        >
          {isChatOpen() ? '>' : '<'}
        </button>
      </header>

      {/* Main content area with optional right chat panel */}
      <div
        class="flex-1 grid bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
        style={{
          display: 'grid',
          'grid-template-columns': isChatOpen() ? '1fr 340px' : '1fr',
          'grid-template-rows': '1fr',
          height: 'calc(100vh - 60px)',
        }}
      >
        {/* Setup gate overlays */}
        <Show when={!validated() || showOrgWizard() || showSetup() !== 'none' || showOrgManager()}>
          <div class="absolute inset-0 z-20 bg-white/70 dark:bg-black/60 backdrop-blur-sm flex items-start justify-center p-6 overflow-auto">
            <div class="bg-white dark:bg-slate-900 rounded shadow-xl w-full max-w-4xl">
              <Show when={showOrgWizard()}>
                <OrgWizard
                  onCreate={async (name) => {
                    setShowOrgWizard(false)
                    try {
                      const r = await fetch(`${SERVER_BASE}/api/orgs`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'X-Auth-Token': dashboardToken,
                        },
                        body: JSON.stringify({ name }),
                      }).then((x) => x.json())
                      if (r.ok) {
                        const names = [...orgs(), name]
                        setOrgs(names)
                        setOrg(name)
                        setShowSetup('create')
                      }
                    } catch {}
                  }}
                  onCancel={() => setShowOrgWizard(false)}
                />
              </Show>
              <Show when={checking()}>
                <div class="p-6 text-center">
                  <div class="text-lg font-semibold mb-1">Checking network status…</div>
                  <div class="text-sm opacity-70">
                    One moment while we detect your Tailscale connection.
                  </div>
                </div>
              </Show>
              <Show when={!showOrgWizard() && showOrgManager()}>
                <div class="p-2 flex justify-end">
                  <button class="px-3 py-2 border rounded" onClick={() => setShowOrgManager(false)}>
                    Close
                  </button>
                </div>
                <OrgManager serverBase={SERVER_BASE} dashboardToken={dashboardToken} />
              </Show>
              <Show when={!showOrgWizard() && !checking() && showSetup() !== 'none'}>
                <SetupWizard
                  mode={showSetup() === 'create' ? 'create' : 'connect'}
                  org={org()}
                  serverBase={SERVER_BASE}
                  dashboardToken={dashboardToken}
                  onDone={(ok) => {
                    if (ok) {
                      setValidated(true)
                      setShowSetup('none')
                      loadState()
                    }
                  }}
                />
              </Show>
            </div>
          </div>
        </Show>

        {/* Center area by tab */}
        <main class="overflow-auto p-3">
          <Show when={activeTab() === 'Agents'}>
            {/* Agents layout: left list, center editor, bottom logs+prompt */}
            <div
              class="grid gap-3"
              style={{
                'grid-template-columns': '280px 1fr',
                'grid-template-rows': 'minmax(400px, 1fr) 260px',
              }}
            >
              {/* Left: agent list */}
              <aside
                class="border rounded p-2 overflow-auto dark:border-slate-700 dark:bg-slate-800"
                style={{ 'grid-row': '1 / span 2' }}
              >
                <div class="text-sm font-semibold mb-2">Agents</div>
                <For each={agents()}>
                  {(a) => (
                    <button
                      class={`w-full text-left border rounded p-2 mb-2 dark:border-slate-700 dark:bg-slate-800 ${selectedAgent() === a.name ? 'bg-slate-200 dark:bg-slate-700' : ''}`}
                      onClick={() => setSelectedAgent(a.name)}
                    >
                      <div class="font-semibold">{a.name}</div>
                      <div class="text-sm opacity-70">
                        {a.role || 'Coder'} — {a.status}
                      </div>
                    </button>
                  )}
                </For>
              </aside>

              {/* Center: iframe editor (only if agent selected) */}
              <Show when={!!selectedAgent()}>
                <section class="border rounded overflow-hidden dark:border-slate-700">
                  <div class="p-2 flex items-center gap-2 border-b dark:border-slate-700">
                    <div class="text-sm opacity-70">
                      Embedded editor for {selectedAgent()}{' '}
                      {selectedAgentPort() ? `(port ${selectedAgentPort()})` : ''}
                    </div>
                    <Show when={!selectedAgentPort()}>
                      <div class="text-xs text-red-500">
                        No editor port reported by backend for this agent.
                      </div>
                    </Show>
                    <button
                      class="ml-auto px-2 py-1 border rounded text-xs dark:border-slate-700"
                      onClick={async () => {
                        const name = selectedAgent()
                        if (!name) return
                        try {
                          await fetch(`${SERVER_BASE}/api/editor/open`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name, org: org() }),
                          })
                          setTimeout(loadState, 1200)
                        } catch {}
                      }}
                    >
                      Open Editor
                    </button>
                  </div>
                  <iframe
                    class="w-full h-full min-h-[400px]"
                    src={editorSrc() + iframeBust()}
                    allow="clipboard-write; clipboard-read; fullscreen; accelerometer; autoplay; camera; microphone; display-capture"
                    allowfullscreen
                    referrerpolicy="no-referrer"
                  />
                </section>
              </Show>

              {/* Bottom: logs (left) and agent prompt (right) — only if agent selected */}
              <Show when={!!selectedAgent()}>
                <section class="grid gap-3" style={{ 'grid-template-columns': '1fr 1fr' }}>
                  <div class="border rounded overflow-hidden flex flex-col dark:border-slate-700">
                    <div class="p-2 border-b font-semibold text-sm dark:border-slate-700">
                      [server] agent logs
                    </div>
                    <pre class="flex-1 bg-slate-50 dark:bg-slate-800 p-2 overflow-auto whitespace-pre-wrap">
                      {agentLogsText() +
                        (taskLogsText()
                          ? `\n\n----- current task logs -----\n${taskLogsText()}`
                          : '')}
                    </pre>
                  </div>
                  <div class="border rounded overflow-hidden flex flex-col dark:border-slate-700">
                    <div class="p-2 border-b font-semibold text-sm dark:border-slate-700">
                      Prompt Agent
                    </div>
                    <div class="p-2 flex gap-2 items-start">
                      <textarea
                        class="border p-2 rounded w-full h-24 dark:border-slate-700 dark:bg-slate-800"
                        placeholder="Ask this agent to do something… (schedules a task for its org)"
                        onInput={(e) => setAgentPromptInput(e.currentTarget.value)}
                        value={agentPromptInput()}
                      />
                      <button
                        class="px-3 py-2 bg-indigo-600 text-white rounded self-end"
                        onClick={askAgentLLM}
                      >
                        Prompt
                      </button>
                    </div>
                    <pre class="bg-slate-50 dark:bg-slate-800 p-2 h-28 overflow-auto whitespace-pre-wrap">
                      {agentPromptLog().join('\n')}
                    </pre>
                  </div>
                </section>
              </Show>
            </div>
          </Show>

          <Show when={activeTab() === 'Tasks'}>
            <div class="space-y-2">
              <div class="text-sm font-semibold">Tasks</div>
              <For each={tasks()}>
                {(t) => (
                  <div class="border rounded p-2 dark:border-slate-700">
                    <div class="font-mono text-sm">
                      [{t.id}] {t.status}
                    </div>
                    <div class="opacity-70">{t.text}</div>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <Show when={activeTab() === 'Users'}>
            <div class="text-sm opacity-70">Users view (coming soon)</div>
          </Show>
          <Show when={activeTab() === 'Projects'}>
            <div class="text-sm opacity-70">Projects view (coming soon)</div>
          </Show>
          <Show when={activeTab() === 'Network'}>
            <div class="text-sm opacity-70">Network view (coming soon)</div>
          </Show>
        </main>

        {/* Right: global chat panel */}
        <aside
          class="border-l p-3 flex flex-col dark:border-slate-700"
          style={{ display: isChatOpen() ? 'flex' : 'none' }}
        >
          <div class="text-sm font-semibold mb-2">Global LLM Chat</div>
          <div class="flex-1 border rounded overflow-auto bg-slate-50 dark:bg-slate-800 p-2 mb-2">
            <pre class="whitespace-pre-wrap">{chatLog().join('\n')}</pre>
          </div>
          <div class="flex gap-2 items-center">
            <input
              class="flex-1 border p-2 rounded dark:border-slate-700 dark:bg-slate-800"
              placeholder="Ask a question…"
              value={chatInput()}
              onInput={(e) => setChatInput(e.currentTarget.value)}
            />
            <button class="px-3 py-2 bg-blue-600 text-white rounded" onClick={askGlobalLLM}>
              Send
            </button>
          </div>
          <Show when={isDev}>
            <div class="mt-3 text-xs">
              <div class="font-semibold mb-1">Debug</div>
              <div class="flex gap-2 mb-2">
                <button
                  class="px-2 py-1 border rounded dark:border-slate-700"
                  onClick={manualEnsure}
                >
                  Ensure Agent
                </button>
                <button
                  class="px-2 py-1 border rounded dark:border-slate-700"
                  onClick={() => {
                    setDebugLines([])
                  }}
                >
                  Clear
                </button>
              </div>
              <pre class="bg-slate-100 dark:bg-slate-800 p-2 h-32 overflow-auto whitespace-pre-wrap">
                {debugLines().join('\n')}
              </pre>
            </div>
          </Show>
        </aside>
      </div>
    </div>
  )
}
