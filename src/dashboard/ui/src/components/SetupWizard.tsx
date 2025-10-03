import { Show, createSignal, onCleanup, onMount, JSX } from 'solid-js'

type Props = {
  mode: 'create' | 'connect'
  org?: string
  serverBase: string
  dashboardToken: string
  onDone: (ok: boolean) => void
}

export default function SetupWizard(props: Props): JSX.Element {
  const [issues, setIssues] = createSignal<string[]>([])
  const [lines, setLines] = createSignal<string[]>([])
  const [running, setRunning] = createSignal(false)
  const [hsUrl, setHsUrl] = createSignal('')
  const [hsSsh, setHsSsh] = createSignal('')
  const [tsKey, setTsKey] = createSignal('')
  const [tsHost, setTsHost] = createSignal('')
  let es: EventSource | null = null

  async function validate() {
    try {
      const r = await fetch(`${props.serverBase}/api/setup/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': props.dashboardToken },
        body: JSON.stringify({
          HEADSCALE_URL: hsUrl() || undefined,
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

  function start() {
    setLines([])
    setRunning(true)
  const qs = new URLSearchParams({ flow: props.mode, mode: 'auto', token: props.dashboardToken })
    if (hsUrl()) qs.set('HEADSCALE_URL', hsUrl())
    if (hsSsh()) qs.set('HEADSCALE_SSH', hsSsh())
    if (tsKey()) qs.set('TS_AUTHKEY', tsKey())
    if (tsHost()) qs.set('TS_HOSTNAME', tsHost())
    if (props.org) qs.set('org', props.org)
    es = new EventSource(`${props.serverBase}/api/setup/stream?${qs.toString()}`, {
      withCredentials: false,
    } as any)
    const push = (tag: string, data: string) =>
      setLines((prev) => [...prev, `[${tag}] ${data}`])
    const handler = (ev: MessageEvent) => push('log', ev.data)
    es.addEventListener('log', handler)
    es.addEventListener('step', (e) => push('step', (e as MessageEvent).data))
    es.addEventListener('stepDone', (e) => push('step-done', (e as MessageEvent).data))
    es.addEventListener('stepError', (e) => push('step-error', (e as MessageEvent).data))
    es.addEventListener('warn', (e) => push('warn', (e as MessageEvent).data))
    es.addEventListener('hint', (e) => push('hint', (e as MessageEvent).data))
    es.addEventListener('error', (e) => push('error', (e as MessageEvent).data))
    es.addEventListener('done', (e) => {
      try {
        const ok = JSON.parse((e as MessageEvent).data).ok
        props.onDone(Boolean(ok))
      } catch {
        props.onDone(false)
      }
      es?.close()
      es = null
      setRunning(false)
    })
  }

  onMount(async () => {
    const v = await validate()
    if (v.ok) start()
  })
  onCleanup(() => es?.close())

  return (
    <div class="max-w-3xl mx-auto p-4">
      <div class="text-xl font-semibold mb-2">
        {props.mode === 'create' ? 'Create a new cluster' : 'Connect this device'}
      </div>
      <div class="grid gap-3 grid-cols-1 md:grid-cols-2 mb-3">
        <div>
          <label class="block text-sm font-semibold mb-1">Headscale URL</label>
          <input class="w-full border p-2 rounded" placeholder="https://headscale.example.com" value={hsUrl()} onInput={(e) => setHsUrl(e.currentTarget.value)} />
        </div>
        <div>
          <label class="block text-sm font-semibold mb-1">Headscale SSH (admin@host) — for external create</label>
          <input class="w-full border p-2 rounded" placeholder="admin@headscale-host" value={hsSsh()} onInput={(e) => setHsSsh(e.currentTarget.value)} />
        </div>
        <div>
          <label class="block text-sm font-semibold mb-1">TS Auth Key</label>
          <input class="w-full border p-2 rounded" placeholder="tskey-..." value={tsKey()} onInput={(e) => setTsKey(e.currentTarget.value)} />
        </div>
        <div>
          <label class="block text-sm font-semibold mb-1">TS Hostname</label>
          <input class="w-full border p-2 rounded" placeholder="orchestrator-myhost" value={tsHost()} onInput={(e) => setTsHost(e.currentTarget.value)} />
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
        <button
          class="px-3 py-2 border rounded"
          disabled={running()}
          onClick={() => start()}
        >
          Retry
        </button>
      </div>
    </div>
  )
}
