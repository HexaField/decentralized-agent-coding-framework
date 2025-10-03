import { For, JSX, Show, createSignal, onMount } from 'solid-js'

type Props = {
  serverBase: string
  dashboardToken: string
}

export default function OrgManager(props: Props): JSX.Element {
  const [orgs, setOrgs] = createSignal<Array<{ id: number; name: string; created_at: string }>>([])
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await fetch(`${props.serverBase}/api/orgs`).then((x) => x.json())
      setOrgs(r.orgs || [])
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

  onMount(load)

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
            <div class="flex items-center justify-between py-1 border-b last:border-b-0 dark:border-slate-700">
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
          )}
        </For>
        <Show when={orgs().length === 0 && !loading()}>
          <div class="text-sm opacity-70">No orgs yet.</div>
        </Show>
      </div>
    </div>
  )
}
