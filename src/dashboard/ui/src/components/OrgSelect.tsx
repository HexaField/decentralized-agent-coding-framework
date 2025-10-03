import { For, JSX } from 'solid-js'

type Props = {
  orgs: string[]
  value: string
  onChange: (org: string) => void
  onCreateNew: () => void
}

export default function OrgSelect(props: Props): JSX.Element {
  return (
    <div class="flex items-center gap-2">
      <label class="font-semibold">Org:</label>
      <select
        class="border p-2 rounded bg-white dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700"
        value={props.value}
        onChange={(e) => props.onChange(e.currentTarget.value)}
      >
        <For each={props.orgs}>{(o) => <option value={o}>{o}</option>}</For>
      </select>
      <button
        class="px-3 py-2 border rounded dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        onClick={props.onCreateNew}
        title="Create a new organization"
      >
        New Org
      </button>
    </div>
  )
}
