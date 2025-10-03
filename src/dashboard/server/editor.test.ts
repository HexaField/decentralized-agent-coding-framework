import 'dotenv/config'

describe.skip('Dashboard editor embed (orchestrator-forwarded) [integration]', () => {
  it('opens an editor for an agent and serves it via /embed/orchestrator/:port', async () => {
    const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://127.0.0.1:8090'
    const org = process.env.ORG || 'acme'

    // Ensure at least one agent exists (same approach as chat.test.ts)
    const ensure = await fetch(`${DASHBOARD_URL}/api/debug/ensure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org, prompt: 'spawn agent for editor test' }),
    })
    expect(ensure.status).toBe(200)

    // Poll /api/state for agent to appear
    const deadline = Date.now() + 60_000
    let agentName = ''
    while (!agentName && Date.now() < deadline) {
      const s = await fetch(`${DASHBOARD_URL}/api/state`)
      expect(s.status).toBe(200)
      const sb = await s.json()
      const agents: Array<any> = Array.isArray(sb.agents) ? sb.agents : []
      if (agents.length > 0) {
        agentName = agents[0]?.name || agents[0]?.Name || ''
        if (agentName) break
      }
      await new Promise((r) => setTimeout(r, 2000))
    }
    expect(agentName).toBeTruthy()

    // Ask dashboard to open editor for this agent (proxies to orchestrator)
    const open = await fetch(`${DASHBOARD_URL}/api/editor/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: agentName, org }),
    })
    expect(open.status).toBe(200)
    const opened = await open.json()
    const port = Number(opened?.port || 0)

    // If immediate port not returned, poll state until editorPort appears
    let editorPort = port
    const deadline2 = Date.now() + 45_000
    while (!editorPort && Date.now() < deadline2) {
      const s = await fetch(`${DASHBOARD_URL}/api/state`)
      expect(s.status).toBe(200)
      const sb = await s.json()
      const agents: Array<any> = Array.isArray(sb.agents) ? sb.agents : []
      const found = agents.find((a) => (a.name || a.Name) === agentName)
      editorPort = Number(found?.editorPort || found?.EditorPort || 0)
      if (editorPort) break
      await new Promise((r) => setTimeout(r, 1500))
    }
    expect(editorPort).toBeGreaterThan(0)

    // Attempt to load the embedded editor through dashboard’s orchestrator proxy
    const embed = await fetch(
      `${DASHBOARD_URL}/embed/orchestrator/${encodeURIComponent(String(editorPort))}/`
    )
    console.log(embed)
    // This must not be a gateway error; expect a successful response (e.g., code-server login page)
    expect(embed.status).toBeGreaterThanOrEqual(200)
    expect(embed.status).toBeLessThan(400)
  }, 180_000)
})
