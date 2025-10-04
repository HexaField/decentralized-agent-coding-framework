import { createSignal, JSX } from 'solid-js'

type Props = {
  onCreate: (org: string, cpNodes?: string, workerNodes?: string) => void
  onCancel: () => void
}

export default function OrgWizard(props: Props): JSX.Element {
  const [org, setOrg] = createSignal('')
  const [nsPrefix, setNsPrefix] = createSignal('org')
  const [cpNodes, setCpNodes] = createSignal('')
  const [workerNodes, setWorkerNodes] = createSignal('')

  return (
    <div class="max-w-xl mx-auto p-4">
      <div class="text-xl font-semibold mb-3">Create new organization</div>
      <div class="space-y-3">
        <div>
          <label class="block text-sm font-semibold mb-1">Name</label>
          <input
            class="w-full border p-2 rounded"
            value={org()}
            onInput={(e) => setOrg(e.currentTarget.value)}
          />
        </div>
        <div>
          <label class="block text-sm font-semibold mb-1">Namespace prefix (optional)</label>
          <input
            class="w-full border p-2 rounded"
            value={nsPrefix()}
            onInput={(e) => setNsPrefix(e.currentTarget.value)}
          />
        </div>
        <div>
          <label class="block text-sm font-semibold mb-1">
            Control-plane node IPs (optional, space-separated)
          </label>
          <input
            class="w-full border p-2 rounded"
            placeholder="10.0.0.10 10.0.0.11"
            value={cpNodes()}
            onInput={(e) => setCpNodes(e.currentTarget.value)}
          />
        </div>
        <div>
          <label class="block text-sm font-semibold mb-1">
            Worker node IPs (optional, space-separated)
          </label>
          <input
            class="w-full border p-2 rounded"
            placeholder="10.0.0.20 10.0.0.21"
            value={workerNodes()}
            onInput={(e) => setWorkerNodes(e.currentTarget.value)}
          />
        </div>
      </div>
      <div class="mt-4 flex gap-2">
        <button
          class="px-3 py-2 bg-indigo-600 text-white rounded"
          onClick={() => {
            const o = org().trim()
            if (!o) return
            props.onCreate(o, cpNodes().trim(), workerNodes().trim())
          }}
        >
          Create
        </button>
        <button class="px-3 py-2 border rounded" onClick={() => props.onCancel()}>
          Cancel
        </button>
      </div>
      <div class="mt-3 text-sm opacity-70">
        Tip: Orgs are stored in the dashboard database. IPs are optional—if left blank, we
        auto-discover nodes via Tailscale by tags or names like &lt;org&gt;-cp-*,
        &lt;org&gt;-worker-*.
      </div>
    </div>
  )
}
