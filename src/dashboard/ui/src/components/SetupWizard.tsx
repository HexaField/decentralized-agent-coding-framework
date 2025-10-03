import { Show, createSignal, onCleanup, onMount, JSX } from 'solid-js'

type Props = {
  mode: 'create' | 'connect'
  serverBase: string
  dashboardToken: string
  onDone: (ok: boolean) => void
}

export default function SetupWizard(props: Props): JSX.Element {
  const [issues, setIssues] = createSignal<string[]>([])
  const [lines, setLines] = createSignal<string[]>([])
  const [running, setRunning] = createSignal(false)
  const [tab, setTab] = createSignal<'join' | 'create'>(props.mode === 'create' ? 'create' : 'join')
  const [result, setResult] = createSignal<null | { ok: boolean; message: string }>(null)
  const [hsUrl, setHsUrl] = createSignal('')
  const [hsSsh, setHsSsh] = createSignal('')
  const [tsKey, setTsKey] = createSignal('')
  const [tsHost, setTsHost] = createSignal('')
  let es: EventSource | null = null

  async function validate(flowOverride?: 'create' | 'connect') {
    try {
      const r = await fetch(`${props.serverBase}/api/setup/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': props.dashboardToken },
        body: JSON.stringify({
          flow: flowOverride || (tab() === 'create' ? 'create' : 'connect'),
          HEADSCALE_URL: hsUrl() || undefined,
          HEADSCALE_SSH: hsSsh() || undefined,
          TS_AUTHKEY: tsKey() || undefined,
          TS_HOSTNAME: tsHost() || undefined,
        }),
      })
      const j = await r.json()
      setIssues(j.issues || [])
      return j
    } catch {
      setIssues(['Validation failed; server unreachable'])
      return { ok: false }
    }
  }

  // Client-side required-field checks
  const canJoin = () => Boolean(hsUrl() && tsKey() && tsHost())
  // Allow local create without Headscale URL (the server will discover it)
  const canCreate = () => Boolean(tsHost()) // && (hsUrl() || hsSsh() || tsKey()))

  async function start(flow: 'connect' | 'create') {
    const v = await validate(flow)
    if (!v.ok) return
    setLines([])
    setRunning(true)
    setResult(null)
    const qs = new URLSearchParams({ flow, mode: 'auto', token: props.dashboardToken })
    if (hsUrl()) qs.set('HEADSCALE_URL', hsUrl())
    if (hsSsh()) qs.set('HEADSCALE_SSH', hsSsh())
    if (tsKey()) qs.set('TS_AUTHKEY', tsKey())
    if (tsHost()) qs.set('TS_HOSTNAME', tsHost())
    es = new EventSource(`${props.serverBase}/api/setup/stream?${qs.toString()}`, {
      withCredentials: false,
    } as any)
    const push = (tag: string, data: string) => {
      console.log(`[setup:${tag}]`, data)
      setLines((prev) => [...prev, `[${tag}] ${data}`])
    }
    const handler = (ev: MessageEvent) => push('log', ev.data)
    es.addEventListener('log', handler)
    es.addEventListener('step', (e) => push('step', (e as MessageEvent).data))
    es.addEventListener('stepDone', (e) => push('step-done', (e as MessageEvent).data))
    es.addEventListener('stepError', (e) => push('step-error', (e as MessageEvent).data))
    es.addEventListener('warn', (e) => push('warn', (e as MessageEvent).data))
    es.addEventListener('hint', (e) => push('hint', (e as MessageEvent).data))
    es.addEventListener('error', (e) => push('error', (e as MessageEvent).data))
    es.addEventListener('error', (e) => {
      setLines((prev) => [...prev, `[error] stream error`])
    })
    es.addEventListener('done', (e) => {
      try {
        const ok = Boolean(JSON.parse((e as MessageEvent).data).ok)
        setResult({ ok, message: ok ? 'Success! This device is connected.' : 'Setup failed.' })
        props.onDone(ok)
      } catch {
        setResult({ ok: false, message: 'Setup failed.' })
        props.onDone(false)
      }
      es?.close()
      es = null
      setRunning(false)
    })
  }

  onMount(async () => {
    await validate()
  })
  onCleanup(() => es?.close())

  return (
    <div class="max-w-3xl mx-auto p-4">
      <div class="text-xl font-semibold mb-2">Connect this device</div>
      <div class="text-xs opacity-70 mb-2">Server: {props.serverBase}</div>
      <div class="mb-3 border-b flex gap-2">
        <button
          class={`px-3 py-2 ${tab() === 'join' ? 'border-b-2 border-indigo-600' : ''}`}
          onClick={() => {
            setTab('join')
            validate('connect')
          }}
        >
          Join existing network
        </button>
        <button
          class={`px-3 py-2 ${tab() === 'create' ? 'border-b-2 border-indigo-600' : ''}`}
          onClick={() => {
            setTab('create')
            validate('create')
          }}
        >
          Create new network
        </button>
      </div>
      <div class="text-xs opacity-70 mb-2">
        <Show when={tab() === 'join'}>Required: Headscale URL, TS Auth Key, TS Hostname.</Show>
        <Show when={tab() === 'create'}>
          Required: TS Hostname and one of: Headscale URL (external), Headscale SSH (external
          bootstrap), or TS Auth Key (join after local bootstrap). No .env files are used here.
        </Show>
      </div>
      <div class="grid gap-3 grid-cols-1 md:grid-cols-2 mb-3">
        <div>
          <label class="block text-sm font-semibold mb-1">Headscale URL</label>
          <input
            class="w-full border p-2 rounded"
            placeholder="https://headscale.example.com"
            value={hsUrl()}
            onInput={(e) => setHsUrl(e.currentTarget.value)}
          />
        </div>
        <div class={tab() === 'create' ? '' : 'opacity-50 pointer-events-none'}>
          <label class="block text-sm font-semibold mb-1">
            Headscale SSH (admin@host) — for external create
          </label>
          <input
            class="w-full border p-2 rounded"
            placeholder="admin@headscale-host"
            value={hsSsh()}
            onInput={(e) => setHsSsh(e.currentTarget.value)}
          />
        </div>
        <div>
          <label class="block text-sm font-semibold mb-1">TS Auth Key</label>
          <input
            class="w-full border p-2 rounded"
            placeholder="tskey-..."
            value={tsKey()}
            onInput={(e) => setTsKey(e.currentTarget.value)}
          />
        </div>
        <div>
          <label class="block text-sm font-semibold mb-1">TS Hostname</label>
          <input
            class="w-full border p-2 rounded"
            placeholder="orchestrator-myhost"
            value={tsHost()}
            onInput={(e) => setTsHost(e.currentTarget.value)}
          />
        </div>
      </div>
      <Show when={issues().length > 0}>
        <div class="border border-amber-400 bg-amber-50 text-amber-900 p-3 rounded mb-3">
          <div class="font-semibold mb-1">Before you start, please fix:</div>
          <ul class="list-disc ml-5">
            {issues().map((s) => (
              <li>{s}</li>
            ))}
          </ul>
        </div>
      </Show>
      <div class="border rounded p-2 bg-slate-50 dark:bg-slate-800 min-h-[200px] whitespace-pre-wrap">
        {lines().join('\n') || 'Preparing…'}
      </div>
      <div class="mt-3 flex gap-2">
        <Show when={tab() === 'join'}>
          <button
            class="px-3 py-2 bg-indigo-600 text-white rounded disabled:bg-indigo-300 disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={running() || !canJoin()}
            onClick={() => start('connect')}
          >
            Join
          </button>
        </Show>
        <Show when={tab() === 'create'}>
          <button
            class="px-3 py-2 bg-indigo-600 text-white rounded disabled:bg-indigo-300 disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={running() || !canCreate()}
            onClick={() => start('create')}
          >
            Create
          </button>
        </Show>
      </div>
      <Show when={result()}>
        <div class="mt-4 p-3 border rounded">
          <div class={`font-semibold ${result()!.ok ? 'text-green-700' : 'text-red-700'}`}>
            {result()!.message}
          </div>
          <div class="mt-2 flex gap-2">
            <button class="px-3 py-2 border rounded" onClick={() => setResult(null)}>
              Close
            </button>
            <button
              class="px-3 py-2 border rounded"
              onClick={() => start(tab() === 'create' ? 'create' : 'connect')}
            >
              Retry
            </button>
          </div>
        </div>
      </Show>
    </div>
  )
}
