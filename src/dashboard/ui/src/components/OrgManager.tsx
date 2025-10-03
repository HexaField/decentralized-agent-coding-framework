import { For, JSX, Show, createSignal, onMount } from 'solid-js'

type Props = {
  serverBase: string
  dashboardToken: string
}

export default function OrgManager(props: Props): JSX.Element {
  const [orgs, setOrgs] = createSignal<Array<{ id: number; name: string; created_at: string }>>([])
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal('')
  const [kcStatus, setKcStatus] = createSignal<Record<string, { exists: boolean; path: string }>>(
    {}
  )
  const [uploading, setUploading] = createSignal<Record<string, boolean>>({})
  const [pasteBuf, setPasteBuf] = createSignal<Record<string, string>>({})
  const [nsMsg, setNsMsg] = createSignal<Record<string, string>>({})
  const [endpointBuf, setEndpointBuf] = createSignal<Record<string, string>>({})
  const [genMsg, setGenMsg] = createSignal<Record<string, string>>({})
  const [talosStatus, setTalosStatus] = createSignal<
    Record<string, { exists: boolean; path: string }>
  >({})
  const [talosPaste, setTalosPaste] = createSignal<Record<string, string>>({})
  const [talosUploading, setTalosUploading] = createSignal<Record<string, boolean>>({})
  const [bootMsg, setBootMsg] = createSignal<string>('')
  const [bootOrg, setBootOrg] = createSignal<string>('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await fetch(`${props.serverBase}/api/orgs`).then((x) => x.json())
      const list = r.orgs || []
      setOrgs(list)
      if (!bootOrg() && list.length > 0) setBootOrg(list[0].name)
      // fetch kubeconfig and talosconfig status for each
      const status: Record<string, { exists: boolean; path: string }> = {}
      const tstatus: Record<string, { exists: boolean; path: string }> = {}
      for (const o of list) {
        try {
          const s = await fetch(
            `${props.serverBase}/api/orgs/${encodeURIComponent(o.name)}/kubeconfig/status`
          ).then((x) => x.json())
          status[o.name] = { exists: Boolean(s.exists), path: s.path || '' }
        } catch {
          status[o.name] = { exists: false, path: '' }
        }
        try {
          const s2 = await fetch(
            `${props.serverBase}/api/orgs/${encodeURIComponent(o.name)}/talosconfig/status`
          ).then((x) => x.json())
          tstatus[o.name] = { exists: Boolean(s2.exists), path: s2.path || '' }
        } catch {
          tstatus[o.name] = { exists: false, path: '' }
        }
      }
      setKcStatus(status)
      setTalosStatus(tstatus)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function remove(id: number) {
    try {
      await fetch(`${props.serverBase}/api/orgs/${id}`, {
        method: 'DELETE',
        headers: { 'X-Auth-Token': props.dashboardToken },
      })
      setOrgs((prev) => prev.filter((o) => o.id !== id))
    } catch (e) {
      setError(String(e))
    }
  }

  async function uploadKubeconfig(name: string, content: string) {
    try {
      setUploading((p) => ({ ...p, [name]: true }))
      const r = await fetch(`${props.serverBase}/api/orgs/${encodeURIComponent(name)}/kubeconfig`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': props.dashboardToken },
        body: JSON.stringify({ kubeconfig: content }),
      }).then((x) => x.json())
      if (!r.ok) throw new Error(r.error || 'upload failed')
      setKcStatus((prev) => ({ ...prev, [name]: { exists: true, path: r.path || '' } }))
    } catch (e) {
      setError(String(e))
    } finally {
      setUploading((p) => ({ ...p, [name]: false }))
    }
  }

  function onFilePicked(name: string, file: File | null) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '')
      uploadKubeconfig(name, text)
    }
    reader.readAsText(file)
  }

  async function uploadTalosconfig(name: string, content: string) {
    try {
      setTalosUploading((p) => ({ ...p, [name]: true }))
      const r = await fetch(
        `${props.serverBase}/api/orgs/${encodeURIComponent(name)}/talosconfig`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Auth-Token': props.dashboardToken },
          body: JSON.stringify({ talosconfig: content }),
        }
      ).then((x) => x.json())
      if (!r.ok) throw new Error(r.error || 'upload failed')
      setTalosStatus((prev) => ({ ...prev, [name]: { exists: true, path: r.path || '' } }))
    } catch (e) {
      setError(String(e))
    } finally {
      setTalosUploading((p) => ({ ...p, [name]: false }))
    }
  }

  onMount(load)

  async function prepareNamespace(name: string) {
    try {
      setNsMsg((p) => ({ ...p, [name]: 'preparing…' }))
      const r = await fetch(`${props.serverBase}/api/k8s/prepare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': props.dashboardToken },
        body: JSON.stringify({ org: name }),
      }).then((x) => x.json())
      if (!r || r.error) throw new Error(r.error || 'prepare failed')
      setNsMsg((p) => ({ ...p, [name]: `ok: ${r.namespace || 'mvp-agents'}` }))
    } catch (e) {
      setNsMsg((p) => ({ ...p, [name]: 'error: ' + String(e) }))
    }
  }

  async function generateKubeconfig(name: string) {
    try {
      setGenMsg((p) => ({ ...p, [name]: 'generating…' }))
      const endpoint = (endpointBuf()[name] || '').trim()
      if (!endpoint) throw new Error('endpoint required')
      const r = await fetch(
        `${props.serverBase}/api/orgs/${encodeURIComponent(name)}/kubeconfig/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Auth-Token': props.dashboardToken },
          body: JSON.stringify({ endpoint }),
        }
      ).then((x) => x.json())
      if (!r || r.ok === false || r.error) throw new Error(r.error || 'generate failed')
      // Refresh status on success
      const s = await fetch(
        `${props.serverBase}/api/orgs/${encodeURIComponent(name)}/kubeconfig/status`
      ).then((x) => x.json())
      setKcStatus((prev) => ({
        ...prev,
        [name]: { exists: Boolean(s.exists), path: s.path || '' },
      }))
      setGenMsg((p) => ({ ...p, [name]: 'ok' }))
    } catch (e) {
      setGenMsg((p) => ({ ...p, [name]: 'error: ' + String(e) }))
    }
  }

  async function bootstrapOrg(cpNodesRaw: string, workerNodesRaw: string) {
    setBootMsg('Bootstrapping…')
    const target = (bootOrg() || '').trim()
    if (!target) {
      setBootMsg('Select an org to bootstrap')
      return
    }
    const cpNodes = cpNodesRaw
      .split(/[\,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    const workerNodes = workerNodesRaw
      .split(/[\,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (cpNodes.length === 0) {
      setBootMsg('At least one control-plane node is required')
      return
    }
    try {
      const r = await fetch(
        `${props.serverBase}/api/orgs/${encodeURIComponent(target)}/bootstrap`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Auth-Token': props.dashboardToken },
          body: JSON.stringify({ cpNodes, workerNodes }),
        }
      )
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) setBootMsg(`Bootstrap failed: ${(j && j.error) || r.statusText}`)
      else {
        setBootMsg(`Bootstrap ok. kubeconfig: ${j.kubeconfig || ''}`)
        await load()
      }
    } catch (e: any) {
      setBootMsg(String(e?.message || e))
    }
  }

  return (
    <div class="p-4">
      <div class="text-xl font-semibold mb-3">Org Manager</div>
      <div class="mb-3 text-sm opacity-70">
        Orgs are persisted in the dashboard database. Use this to review or delete entries.
      </div>
      <Show when={error()}>
        <div class="border border-red-300 bg-red-50 text-red-800 p-2 rounded mb-2">{error()}</div>
      </Show>
      <div class="mb-2 flex gap-2">
        <button class="px-3 py-2 border rounded" onClick={load} disabled={loading()}>
          {loading() ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <div class="border rounded p-2 dark:border-slate-700 dark:bg-slate-800">
        <For each={orgs()}>
          {(o) => (
            <div class="flex flex-col gap-2 py-2 border-b last:border-b-0 dark:border-slate-700">
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-semibold">{o.name}</div>
                  <div class="text-xs opacity-70">
                    id: {o.id} — created: {new Date(o.created_at).toLocaleString()}
                  </div>
                </div>
                <button
                  class="px-2 py-1 border rounded text-red-700 border-red-300"
                  onClick={() => remove(o.id)}
                >
                  Delete
                </button>
              </div>
              <div class="text-xs">
                Kubeconfig:{' '}
                {kcStatus()[o.name]?.exists ? (
                  <span class="text-green-600">present</span>
                ) : (
                  <span class="text-red-600">missing</span>
                )}
                {kcStatus()[o.name]?.path ? (
                  <span class="opacity-60"> — {kcStatus()[o.name]?.path}</span>
                ) : null}
              </div>
              <div class="text-xs">
                Talos config:{' '}
                {talosStatus()[o.name]?.exists ? (
                  <span class="text-green-600">present</span>
                ) : (
                  <span class="text-red-600">missing</span>
                )}
                {talosStatus()[o.name]?.path ? (
                  <span class="opacity-60"> — {talosStatus()[o.name]?.path}</span>
                ) : null}
              </div>
              <div class="flex flex-col gap-2 md:flex-row md:items-center">
                <label class="text-sm">Talos endpoint (IP or DNS):</label>
                <input
                  class="border rounded px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                  placeholder="10.0.0.10"
                  value={endpointBuf()[o.name] || ''}
                  onInput={(e) =>
                    setEndpointBuf((p) => ({ ...p, [o.name]: e.currentTarget.value }))
                  }
                />
                <button class="px-2 py-1 border rounded" onClick={() => generateKubeconfig(o.name)}>
                  Generate kubeconfig
                </button>
                <span class="text-xs opacity-70">{genMsg()[o.name] || ''}</span>
              </div>
              <div class="flex flex-col gap-2 md:flex-row md:items-center">
                <label class="text-sm">Upload file:</label>
                <input
                  type="file"
                  accept=".yaml,.yml,.conf,.config,.txt"
                  onChange={(e) =>
                    onFilePicked(
                      o.name,
                      (e.currentTarget.files && e.currentTarget.files[0]) || null
                    )
                  }
                />
                <span class="text-xs opacity-60">or paste below</span>
                <button
                  class="px-2 py-1 border rounded"
                  disabled={!!uploading()[o.name]}
                  onClick={() => uploadKubeconfig(o.name, pasteBuf()[o.name] || '')}
                >
                  {uploading()[o.name] ? 'Uploading…' : 'Save pasted'}
                </button>
              </div>
              <div class="flex flex-col gap-2 md:flex-row md:items-center">
                <label class="text-sm">Talosconfig file:</label>
                <input
                  type="file"
                  accept=".yaml,.yml,.conf,.config,.txt"
                  onChange={(e) => {
                    const file = (e.currentTarget.files && e.currentTarget.files[0]) || null
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = () => uploadTalosconfig(o.name, String(reader.result || ''))
                    reader.readAsText(file)
                  }}
                />
                <span class="text-xs opacity-60">or paste below</span>
                <button
                  class="px-2 py-1 border rounded"
                  disabled={!!talosUploading()[o.name]}
                  onClick={() => uploadTalosconfig(o.name, talosPaste()[o.name] || '')}
                >
                  {talosUploading()[o.name] ? 'Uploading…' : 'Save talosconfig'}
                </button>
              </div>
              <div class="flex items-center gap-2">
                <button class="px-2 py-1 border rounded" onClick={() => prepareNamespace(o.name)}>
                  Prepare namespace
                </button>
                <span class="text-xs opacity-70">{nsMsg()[o.name] || ''}</span>
              </div>
              <textarea
                class="w-full border rounded p-2 text-xs font-mono dark:border-slate-700 dark:bg-slate-900"
                rows={4}
                placeholder="# Paste kubeconfig content here"
                value={pasteBuf()[o.name] || ''}
                onInput={(e) => setPasteBuf((p) => ({ ...p, [o.name]: e.currentTarget.value }))}
              />
              <textarea
                class="w-full border rounded p-2 text-xs font-mono dark:border-slate-700 dark:bg-slate-900"
                rows={4}
                placeholder="# Paste talosconfig content here"
                value={talosPaste()[o.name] || ''}
                onInput={(e) => setTalosPaste((p) => ({ ...p, [o.name]: e.currentTarget.value }))}
              />
            </div>
          )}
        </For>
        <Show when={orgs().length === 0 && !loading()}>
          <div class="text-sm opacity-70">No orgs yet.</div>
        </Show>
      </div>
      <div class="mt-2">
        <div class="divider my-2">or</div>
        <div class="text-sm">Bootstrap cluster</div>
        <div class="flex items-center gap-2 mb-2">
          <label class="text-sm">Org:</label>
          <select
            class="border rounded px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
            value={bootOrg()}
            onChange={(e) => setBootOrg(e.currentTarget.value)}
          >
            <For each={orgs()}>{(o) => <option value={o.name}>{o.name}</option>}</For>
          </select>
        </div>
        <div class="grid md:grid-cols-2 gap-2">
          <input
            id="cpnodes"
            class="input input-bordered"
            placeholder="cp nodes (ip or dns, space or comma)"
          />
          <input id="wknodes" class="input input-bordered" placeholder="worker nodes (optional)" />
        </div>
        <div class="flex gap-2 items-center">
          <button
            class="px-2 py-1 border rounded"
            onClick={() => {
              const cp = (document.getElementById('cpnodes') as HTMLInputElement)?.value || ''
              const wk = (document.getElementById('wknodes') as HTMLInputElement)?.value || ''
              bootstrapOrg(cp, wk)
            }}
          >
            Bootstrap
          </button>
          <div class="text-xs opacity-70">{bootMsg()}</div>
        </div>
      </div>
    </div>
  )
}
