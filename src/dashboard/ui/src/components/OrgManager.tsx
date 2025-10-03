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

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await fetch(`${props.serverBase}/api/orgs`).then((x) => x.json())
      const list = r.orgs || []
      setOrgs(list)
      // fetch kubeconfig status for each
      const status: Record<string, { exists: boolean; path: string }> = {}
      for (const o of list) {
        try {
          const s = await fetch(
            `${props.serverBase}/api/orgs/${encodeURIComponent(o.name)}/kubeconfig/status`
          ).then((x) => x.json())
          status[o.name] = { exists: Boolean(s.exists), path: s.path || '' }
        } catch {
          status[o.name] = { exists: false, path: '' }
        }
      }
      setKcStatus(status)
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
            </div>
          )}
        </For>
        <Show when={orgs().length === 0 && !loading()}>
          <div class="text-sm opacity-70">No orgs yet.</div>
        </Show>
      </div>
    </div>
  )
}
