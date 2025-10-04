// Centralized E2E env loader with *_TEST fallbacks
import 'dotenv/config'

// Prefer *_TEST values, fall back to base, finally to sensible local defaults
const pick = (name: string, def?: string): string | undefined => {
  const testName = `${name}_TEST`
  return process.env[testName] || process.env[name] || def
}

export const DASHBOARD_URL: string = pick('DASHBOARD_URL', 'https://127.0.0.1:8443')!
export const DASHBOARD_TOKEN: string = pick('DASHBOARD_TOKEN', 'dashboard-secret')!

export const ORCHESTRATOR_URL: string | undefined = pick(
  'ORCHESTRATOR_URL',
  'http://127.0.0.1:18080'
)
export const ORCHESTRATOR_TOKEN: string | undefined = pick(
  'ORCHESTRATOR_TOKEN',
  'orchestrator-secret'
)

export const HEADSCALE_URL: string | undefined = pick('HEADSCALE_URL')
export const TS_AUTHKEY: string | undefined = pick('TS_AUTHKEY')
export const TS_HOSTNAME: string = pick(
  'TS_HOSTNAME',
  `orchestrator-${Math.random().toString(36).slice(2, 8)}`
)!

export const E2E_ORG: string = pick('E2E_ORG', `e2e-${Math.random().toString(36).slice(2, 8)}`)!
export const E2E_CP_NODES = (pick('E2E_CP_NODES', '') || '').split(/[\,\s]+/).filter(Boolean)
export const E2E_WK_NODES = (pick('E2E_WK_NODES', '') || '').split(/[\,\s]+/).filter(Boolean)

export const RUN_TAILSCALE_E2E = pick('RUN_TAILSCALE_E2E', '0') === '1'
export const TEST_FAST_SETUP = pick('TEST_FAST_SETUP', '0') // default to full setup for CI

// For local https with self-signed certs
if (/^https:\/\/(127\.0\.0\.1|localhost)/i.test(DASHBOARD_URL)) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0'
}

export async function dashboardReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${DASHBOARD_URL}/api/health`, { cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}

// Tests no longer override state dir; server uses ~/.guildnet/state exclusively.
