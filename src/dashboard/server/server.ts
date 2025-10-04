import 'dotenv/config'
// Also try to load repo-root .env if running from src/dashboard (dev) and vars are missing
try {
  const hereFile = new URL(import.meta.url).pathname
  // If server is under src/dashboard and ORCHESTRATOR_TOKEN isn't set, try loading ../../.env
  if (!process.env.ORCHESTRATOR_TOKEN || !process.env.DASHBOARD_TOKEN) {
    const pathMod = await import('path')
    const fsMod = await import('fs')
    const candidates = [
      // repo root .env (../../.. from server.ts)
      pathMod.resolve(pathMod.dirname(hereFile), '..', '..', '..', '.env'),
      // dashboard directory .env
      pathMod.resolve(pathMod.dirname(hereFile), '..', '.env'),
      // src .env (legacy)
      pathMod.resolve(pathMod.dirname(hereFile), '..', '..', '.env'),
      // cwd .env
      pathMod.resolve(process.cwd(), '.env'),
    ]
    for (const p of candidates) {
      try {
        if (fsMod.existsSync(p)) {
          const dotenv = await import('dotenv')
          dotenv.config({ path: p })
          break
        }
      } catch {}
    }
  }
} catch {}
import express from 'express'
import path from 'path'
import fs from 'fs'
import http from 'http'
import https from 'https'
import httpProxy from 'http-proxy'
import { spawn } from 'child_process'
import sqlite3 from 'sqlite3'
import { open, Database } from 'sqlite'

const app = express()
app.use(express.json())

const PORT = Number(process.env.PORT || 8090)
const TOKEN = process.env.DASHBOARD_TOKEN || 'dashboard-secret'
function normalizeOrchUrl(raw: string): string {
  try {
    const u = new URL(raw)
    const isDev = process.env.UI_DEV === '1'
    // In local dev, avoid container-internal hostnames; prefer loopback
    if (isDev) {
      if (u.hostname === '0.0.0.0' || u.hostname === 'mvp-orchestrator') {
        u.hostname = '127.0.0.1'
        // Compose maps orchestrator 8080 -> host 18080; use 18080 in dev.
        u.port = '18080'
        if (!u.protocol) u.protocol = 'http:'
      }
      // If someone pointed to docker network name or blank host, fixup to localhost:18080
      if (!u.hostname || u.hostname === '') {
        u.hostname = '127.0.0.1'
        if (!u.port) u.port = '18080'
        if (!u.protocol) u.protocol = 'http:'
      }
    } else {
      // Non-dev: minor fix for 0.0.0.0
      if (u.hostname === '0.0.0.0') u.hostname = '127.0.0.1'
    }
    return u.toString().replace(/\/$/, '')
  } catch {
    return raw
  }
}
let ORCH_URL = normalizeOrchUrl(
  process.env.ORCHESTRATOR_URL ||
    (process.env.UI_DEV === '1' ? 'http://127.0.0.1:18080' : 'http://mvp-orchestrator:8080')
)
// Prefer explicit orchestrator token; fall back to a few common env names; do NOT assume dashboard token matches
const ORCH_TOKEN =
  process.env.ORCHESTRATOR_TOKEN ||
  process.env.ORCH_TOKEN ||
  process.env.ORCHESTRATOR_API_TOKEN ||
  ''
const proxy = httpProxy.createProxyServer({ ws: true, changeOrigin: true, xfwd: true })
// Optional auth header for agent fallback HTTP server; harmless for code-server
const CS_AUTH_HEADER = process.env.CODE_SERVER_AUTH_HEADER || 'X-Agent-Auth'
const CS_AUTH_TOKEN = process.env.CODE_SERVER_TOKEN || 'password'

// CORS allowed origins (debug stream diagnostic only)
const ALLOW_ORIGINS = (process.env.ALLOW_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

// CORS (scoped): allow Vite dev UI and any explicit ALLOW_ORIGINS
app.use((req, res, next) => {
  try {
    const origin = (req.headers.origin as string) || ''
    if (origin) {
      const devOrigins: string[] = []
      const viteUrl = (process.env.VITE_DEV_URL || '').trim()
      if (viteUrl) devOrigins.push(viteUrl.replace(/\/$/, ''))
      // Always allow common localhost dev origins (handy when server runs via compose without UI_DEV)
      try {
        const u = new URL(origin)
        if ((u.hostname === 'localhost' || u.hostname === '127.0.0.1') && u.port === '5173') {
          devOrigins.push(`${u.protocol}//${u.hostname}:5173`)
        }
      } catch {}
      devOrigins.push('https://localhost:5173', 'https://127.0.0.1:5173')
      const explicit = ALLOW_ORIGINS
      const allowed = new Set<string>([...devOrigins, ...explicit])
      // Normalize origin for comparison (strip trailing slash)
      const want = origin.replace(/\/$/, '')
      if (allowed.has(want)) {
        res.setHeader('Access-Control-Allow-Origin', origin)
        res.setHeader('Vary', 'Origin')
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, X-Auth-Token, X-Requested-With'
        )
        res.setHeader('Access-Control-Allow-Credentials', 'true')
        if (req.method === 'OPTIONS') return res.status(204).end()
      }
    }
  } catch {}
  next()
})

// Simple in-memory chat backlog for demo endpoints
const chats: { global: Array<{ role: string; text: string }> } = { global: [] }

// State base directory under HOME (dev vs prod)
function stateBaseDir(): string {
  const home = process.env.HOME || '/root'
  const env = process.env.GUILDNET_ENV === 'dev' ? '.guildnetdev' : '.guildnet'
  const dir = path.join(home, env, 'state')
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {}
  return dir
}

// SQLite DB helper with minimal schema
let __dbPromise: Promise<Database<sqlite3.Database, sqlite3.Statement>> | null = null
async function getDB(): Promise<Database<sqlite3.Database, sqlite3.Statement>> {
  if (!__dbPromise) {
    const dbPath = path.join(stateBaseDir(), 'dashboard.db')
    __dbPromise = open({ filename: dbPath, driver: sqlite3.Database }).then(async (db) => {
      await db.exec(
        `CREATE TABLE IF NOT EXISTS orgs (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           name TEXT UNIQUE NOT NULL,
           created_at DATETIME DEFAULT CURRENT_TIMESTAMP
         );`
      )
      await db.exec(
        `CREATE TABLE IF NOT EXISTS kv (
           key TEXT PRIMARY KEY,
           value TEXT,
           updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
         );`
      )
      return db
    })
  }
  return __dbPromise
}

// Small fetch helper
async function fetchJSON(
  url: string,
  opts?: { method?: string; headers?: Record<string, string>; body?: any }
): Promise<any> {
  const init: any = { method: opts?.method || 'GET', headers: opts?.headers || {} }
  if (opts && 'body' in opts) {
    init.method = init.method || 'POST'
    init.headers = Object.assign({ 'Content-Type': 'application/json' }, init.headers)
    init.body = JSON.stringify(opts.body)
  }
  const res = await fetch(url, init as any)
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`)
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

// Run a quick child process and capture combined output
async function runQuick(
  cmd: string,
  args: string[] = [],
  opts?: { timeoutMs?: number; cwd?: string; env?: NodeJS.ProcessEnv }
): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: opts?.cwd, env: opts?.env })
    let buf = ''
    let done = false
    const finish = (code: number) => {
      if (done) return
      done = true
      resolve({ code: code ?? 0, out: buf })
    }
    let to: any = null
    if (opts?.timeoutMs && opts.timeoutMs > 0) {
      to = setTimeout(() => {
        try {
          p.kill('SIGKILL')
        } catch {}
        finish(124)
      }, opts.timeoutMs)
    }
    p.stdout.on('data', (d) => (buf += String(d)))
    p.stderr.on('data', (d) => (buf += String(d)))
    p.on('close', (code) => {
      if (to) clearTimeout(to)
      finish(code ?? 0)
    })
    p.on('error', () => {
      if (to) clearTimeout(to)
      finish(127)
    })
  })
}

async function isPasswordlessSudo(): Promise<boolean> {
  const r = await runQuick('sudo', ['-n', 'true'], { timeoutMs: 2000 })
  return r.code === 0
}

async function ensureTailscaleService(
  linuxWithSudo: boolean,
  log?: (s: string) => void
): Promise<boolean> {
  // Best-effort: ensure tailscale CLI responds; on Linux try starting tailscaled
  const ver = await runQuick('tailscale', ['version'], { timeoutMs: 3000 })
  if (ver.code === 0) return true
  if (process.platform !== 'darwin' && linuxWithSudo) {
    if (log) log('Attempting to start tailscaled via systemctl…')
    await runQuick('sudo', ['-n', 'systemctl', 'enable', '--now', 'tailscaled'], {
      timeoutMs: 8000,
    })
    const v2 = await runQuick('tailscale', ['version'], { timeoutMs: 3000 })
    return v2.code === 0
  }
  return false
}

async function pollTailscaleConnected(timeoutMs = 60000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const r = await runQuick('tailscale', ['status', '--json'], { timeoutMs: 3000 })
    if (r.code === 0) {
      try {
        const j = JSON.parse(r.out || '{}')
        const ok = Boolean(j && j.Self && (j.Self.TailAddr || j.Self.HostName))
        if (ok) return true
      } catch {
        if (/BackendState|wgpeer|relay/i.test(r.out)) return true
      }
    }
    await new Promise((r0) => setTimeout(r0, 1000))
  }
  return false
}

async function spawnInteractiveJoin(
  hsUrl: string,
  key: string,
  hostname: string,
  onLog?: (line: string) => void
): Promise<void> {
  // Minimal fallback: try non-interactive again but report as interactive
  if (onLog) onLog('Opening interactive join is not supported in this environment; retrying up…')
  const args = [
    'up',
    `--login-server=${hsUrl}`,
    `--authkey=${key}`,
    `--hostname=${hostname}`,
    '--accept-dns=false',
    '--ssh=false',
    '--reset',
    '--force-reauth',
  ]
  await runQuick('tailscale', args, { timeoutMs: 20000 })
}

function getOrchBase(): string {
  const override = (global as any).__ORCH_OVERRIDE__
  const envUrl = process.env.ORCHESTRATOR_URL
  const base =
    (typeof override === 'string' && override) || (envUrl && envUrl.length ? envUrl : ORCH_URL)
  return normalizeOrchUrl(base)
}

function getOrchAuthHeader(): Record<string, string> {
  const token =
    process.env.ORCHESTRATOR_TOKEN ||
    process.env.ORCH_TOKEN ||
    process.env.ORCHESTRATOR_API_TOKEN ||
    ORCH_TOKEN
  return token ? { 'X-Auth-Token': token } : {}
}

// Relax frame embedding for proxied responses
proxy.on('proxyRes', (proxyRes, req: any, res) => {
  try {
    delete (proxyRes as any).headers['x-frame-options']
    delete (proxyRes as any).headers['content-security-policy']
    res.setHeader('X-Frame-Options', 'ALLOWALL')
    // If this is an embed request, rewrite redirects and cookie paths to stay under the embed base
    const base: string | undefined = req && (req as any)._embedBase
    if (base) {
      const headers: any = (proxyRes as any).headers || {}
      const loc = headers['location'] || headers['Location']
      if (typeof loc === 'string' && loc) {
        try {
          let newLoc = loc
          if (loc.startsWith('/')) {
            newLoc = base + loc
          } else {
            const u = new URL(loc)
            // strip scheme+host and keep pathname+search
            newLoc = base + u.pathname + (u.search || '')
          }
          headers['location'] = newLoc
        } catch {}
      }
      const setCookie = headers['set-cookie'] || headers['Set-Cookie']
      if (setCookie) {
        const arr = Array.isArray(setCookie) ? setCookie : [String(setCookie)]
        const rewritten = arr.map((c: string) => {
          let cc = c
          try {
            // Rewrite Path attribute to stay under the embed base
            if (/;\s*Path=([^;]+)/i.test(cc)) {
              cc = cc.replace(/;\s*Path=([^;]+)/i, (_m: string, p1: string) => {
                const orig = String(p1 || '').trim()
                const newPath = base + (orig.startsWith('/') ? orig : `/${orig}`)
                return `; Path=${newPath}`
              })
            } else {
              const newPath = base.endsWith('/') ? base : `${base}/`
              cc = `${cc}; Path=${newPath}`
            }
          } catch {}
          return cc
        })
        ;(proxyRes as any).headers['set-cookie'] = rewritten
      }
    }
  } catch {}
})
async function setupStream(req: any, res: any) {
  // Require dashboard token; allow via header or query param (EventSource can't set headers)
  const qtok = (req.query && (req.query as any).token) || ''
  const presented = (req.headers['x-auth-token'] as string) || String(qtok || '')
  if (presented !== TOKEN) {
    res.status(401).end('unauthorized')
    return
  }

  const flow = String(req.query.flow || 'connect') // 'create' | 'connect'
  const orgParam = String(req.query.org || '') // optional single org name
  // Distributed-only: require external Headscale and TS key/hostname
  const HS_URL = String((req.query as any).HEADSCALE_URL || '')
  const TS_KEY = String((req.query as any).TS_AUTHKEY || '')
  const TS_HOST = String((req.query as any).TS_HOSTNAME || '')
  // Fast mode removed: always run full steps

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  const send = (event: string, data: any) => {
    res.write(`event: ${event}\n`)
    res.write(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`)
  }

  const here = path.dirname(new URL(import.meta.url).pathname)
  const srcDir = path.resolve(here, '..', '..')
  const resolveScript = (name: string) => path.resolve(srcDir, 'scripts', name)
  const runStep = (
    title: string,
    file: string,
    args: string[] = [],
    envOverride: Record<string, string> = {}
  ) =>
    new Promise<void>((resolve, reject) => {
      send('step', { title, file, args })
      const childEnv: NodeJS.ProcessEnv = { ...process.env, ...envOverride }
      const proc = spawn('bash', [file, ...args], { cwd: srcDir, env: childEnv })
      proc.stdout.on('data', (d) => send('log', String(d)))
      proc.stderr.on('data', (d) => send('log', String(d)))
      proc.on('close', (code) => {
        if (code === 0) {
          send('stepDone', { title, code })
          resolve()
        } else {
          send('stepError', { title, code })
          reject(new Error(`${title} failed: ${code}`))
        }
      })
    })

  try {
    send('begin', { flow, mode: 'external', org: orgParam || undefined })

    // Inputs are mandatory for both flows in distributed mode
    const missing: string[] = []
    if (!HS_URL) missing.push('HEADSCALE_URL')
    if (!TS_KEY) missing.push('TS_AUTHKEY')
    if (!TS_HOST) missing.push('TS_HOSTNAME')
    if (missing.length) {
      send('error', `Missing required inputs: ${missing.join(', ')}`)
      send('done', { ok: false })
      return res.end()
    }

    // 1) Join this host to tailnet
    const hostForJoin = TS_HOST || `orchestrator-${Math.random().toString(36).slice(2, 8)}`
    const ALLOW_INTERACTIVE =
      process.env.SETUP_ALLOW_INTERACTIVE !== '0' && process.env.RUN_TAILSCALE_E2E !== '1'
    let joined = false
    const hasPwless = await isPasswordlessSudo()
    if (process.platform === 'darwin') {
      try {
        send('step', { title: 'Join tailnet (non-interactive)' })
        const svcOk = await ensureTailscaleService(false, (s) => send('log', s))
        if (!svcOk) throw new Error('Tailscale service not reachable')
        const args = [
          'up',
          `--login-server=${HS_URL}`,
          `--authkey=${TS_KEY}`,
          `--hostname=${hostForJoin}`,
          '--accept-dns=false',
          '--ssh=false',
          '--reset',
          '--force-reauth',
        ]
        const r = await runQuick('tailscale', args, { timeoutMs: 30000 })
        if (r.code !== 0) throw new Error(r.out || 'tailscale up failed')
        const ok = await pollTailscaleConnected(60000)
        if (!ok) throw new Error('tailscale did not connect within timeout')
        send('stepDone', { title: 'Join tailnet (non-interactive)', code: 0 })
        joined = true
      } catch (e: any) {
        send('stepError', { title: 'Join tailnet (non-interactive)', code: 1 })
        send('log', String(e && e.message ? e.message : e))
      }
    } else if (hasPwless) {
      try {
        send('step', { title: 'Join tailnet (non-interactive)' })
        const svcOk = await ensureTailscaleService(true, (s) => send('log', s))
        if (!svcOk) throw new Error('Tailscale service not reachable')
        const args = [
          'tailscale',
          'up',
          `--login-server=${HS_URL}`,
          `--authkey=${TS_KEY}`,
          `--hostname=${hostForJoin}`,
          '--accept-dns=false',
          '--ssh',
          '--reset',
          '--force-reauth',
        ]
        const r = await runQuick('sudo', ['-n', ...args], { timeoutMs: 20000 })
        if (r.code !== 0) throw new Error(r.out || 'tailscale up failed')
        const ok = await pollTailscaleConnected(60000)
        if (!ok) throw new Error('tailscale did not connect within timeout')
        send('stepDone', { title: 'Join tailnet (non-interactive)', code: 0 })
        joined = true
      } catch (e: any) {
        send('stepError', { title: 'Join tailnet (non-interactive)', code: 1 })
        send('log', String(e && e.message ? e.message : e))
      }
    }
    if (!joined && ALLOW_INTERACTIVE) {
      send('step', { title: 'Join tailnet (interactive)' })
      await spawnInteractiveJoin(HS_URL, TS_KEY, hostForJoin, (line) => send('log', line))
      const ok = await pollTailscaleConnected(180000)
      if (!ok) {
        send('stepError', { title: 'Join tailnet (interactive)', code: 1 })
        throw new Error('tailscale did not connect; please check the Terminal window or retry')
      }
      send('stepDone', { title: 'Join tailnet (interactive)', code: 0 })
    }
    if (!joined && !ALLOW_INTERACTIVE) {
      throw new Error('Interactive join disabled and non-interactive join failed')
    }

    try {
      const db = await getDB()
      await db.run(
        'INSERT INTO kv(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP',
        'tailscale_connected',
        '1'
      )
    } catch {}

    if (flow === 'create') {
      // 2) Per-org steps: discover nodes via Tailscale and bootstrap with Talos
      const orgs: string[] = []
      if (orgParam) orgs.push(orgParam)
      else {
        try {
          const db = await getDB()
          const rows: Array<{ name: string }> = await db.all(
            'SELECT name FROM orgs ORDER BY id ASC'
          )
          rows.forEach((r) => orgs.push(r.name))
        } catch {}
      }
      for (const o of orgs) {
        const env: Record<string, string> = {}
        // Discover nodes via tailscale status
        try {
          const r = await runQuick('tailscale', ['status', '--json'], { timeoutMs: 5000 })
          if (r.code === 0 && r.out) {
            const j = JSON.parse(r.out)
            const peers = (j && (j.Peers || j.Peer || [])) || []
            const self = j && j.Self ? [j.Self] : []
            const all = Array.isArray(peers) ? peers.concat(self) : self
            const up = o.toUpperCase()
            const nameMatches = (hn: string, pref: string) => hn.toLowerCase().startsWith(pref)
            const tagsOf = (p: any) => (p && (p.Tags || p.Tag || p.forcedTags || [])) || []
            const ipv4 = (p: any): string =>
              p && (p.TailscaleIPs || p.TailscaleIP || p.TailAddr || [])
                ? Array.isArray(p.TailscaleIPs)
                  ? p.TailscaleIPs.find((x: string) => x.includes('.')) || ''
                  : String(p.TailAddr || '').includes('.')
                    ? String(p.TailAddr)
                    : ''
                : ''
            const cp: string[] = []
            const wk: string[] = []
            for (const p of all) {
              const hn = String((p && (p.HostName || p.Hostname || p.DNSName || '')) || '')
              const ip = ipv4(p)
              if (!ip) continue
              if (nameMatches(hn, `${o}-cp-`)) cp.push(ip)
              else if (nameMatches(hn, `${o}-worker-`)) wk.push(ip)
            }
            if (!cp.length || !wk.length) {
              for (const p of all) {
                const ip = ipv4(p)
                if (!ip) continue
                const tags = tagsOf(p).map((t: any) => String(t))
                if (!cp.length && tags.some((t: any) => /(^|:)cp($|:)/i.test(t))) cp.push(ip)
                if (!wk.length && tags.some((t: any) => /(^|:)worker($|:)/i.test(t))) wk.push(ip)
              }
            }
            if (cp.length) env[`${up}_CP_NODES`] = cp.join(' ')
            if (wk.length) env[`${up}_WORKER_NODES`] = wk.join(' ')
          }
        } catch {}
        if (!env[`${o.toUpperCase()}_CP_NODES`]) {
          send(
            'hint',
            `No control-plane nodes for '${o}'. Name nodes '${o}-cp-*' or tag with 'cp'.`
          )
        }
        await runStep(
          `Talos org bootstrap (${o})`,
          resolveScript('talos_org_bootstrap.sh'),
          [o],
          env
        )
        await runStep(
          `Install Tailscale Operator (${o})`,
          resolveScript('install_tailscale_operator.sh'),
          [o]
        )
        await runStep(`Deploy demo app (${o})`, resolveScript('demo_app.sh'), [o])
      }
      await runStep('Start orchestrator + dashboard', resolveScript('start_orchestrator.sh'), [
        'up',
      ])
    } else if (flow === 'connect') {
      await runStep('Start orchestrator + dashboard', resolveScript('start_orchestrator.sh'), [
        'up',
      ])
    }

    send('done', { ok: true })
  } catch (e: any) {
    send('error', String(e && e.message ? e.message : e))
    send('done', { ok: false })
  } finally {
    res.end()
  }
}
app.get('/api/setup/stream', setupStream)
app.post('/api/setup/stream', setupStream)
app.post('/api/orgs', async (req, res) => {
  if ((req.headers['x-auth-token'] as string) !== TOKEN)
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  const bodyIn = (typeof req.body === 'object' && req.body) || {}
  const name = (bodyIn && String((bodyIn as any).name || '').trim()) || ''
  if (!name) return res.status(400).json({ ok: false, error: 'name required' })
  try {
    const db = await getDB()
    await db.run('INSERT INTO orgs(name) VALUES (?)', name)
    const row = await db.get('SELECT id, name, created_at FROM orgs WHERE name=?', name)
    // Suggest SSE provision stream URL in response so UI can attach for progress.
    const provUrl = `/api/orgs/${encodeURIComponent(name)}/provision/stream`
    res.json({ ok: true, org: row, provisionStream: provUrl })
  } catch (e: any) {
    if (String(e && e.message).includes('UNIQUE'))
      return res.status(409).json({ ok: false, error: 'exists' })
    res.status(500).json({ ok: false, error: String(e) })
  }
})
app.delete('/api/orgs/:id', async (req, res) => {
  if ((req.headers['x-auth-token'] as string) !== TOKEN)
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ ok: false, error: 'bad id' })
  try {
    const db = await getDB()
    await db.run('DELETE FROM orgs WHERE id=?', id)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})
// List orgs
app.get('/api/orgs', async (_req, res) => {
  try {
    const db = await getDB()
    const rows = await db.all('SELECT id, name, created_at FROM orgs ORDER BY id DESC')
    res.json({ ok: true, orgs: rows })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// Kubeconfig management for orgs (status + upload)
app.get('/api/orgs/:name/kubeconfig/status', async (req, res) => {
  try {
    const name = String(req.params.name || '').trim()
    if (!name) return res.status(400).json({ ok: false, error: 'bad name' })
    const p = path.join(stateBaseDir(), 'kube', `${name}.config`)
    const existsOnDisk = fs.existsSync(p)
    let placeholder = false
    let valid = false
    if (existsOnDisk) {
      try {
        const text = fs.readFileSync(p, 'utf8')
        const meaningful = text.split(/\r?\n/).some((ln) => ln.trim() && !ln.trim().startsWith('#'))
        placeholder = /GENERATED_PLACEHOLDER/i.test(text) || /PLACEHOLDER-TOKEN/i.test(text)
        const badServer = /server:\s*https?:\/\/(0\.0\.0\.0|127\.0\.0\.1):/i.test(text)
        valid = meaningful && /apiVersion:\s*v1/i.test(text) && /kind:\s*Config/i.test(text) && !placeholder && !badServer
      } catch {}
    }
    res.json({ ok: true, exists: existsOnDisk, placeholder, valid, path: existsOnDisk ? p : '' })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})
app.post('/api/orgs/:name/kubeconfig', async (req, res) => {
  if ((req.headers['x-auth-token'] as string) !== TOKEN)
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  try {
    const name = String(req.params.name || '').trim()
    if (!name) return res.status(400).json({ ok: false, error: 'bad name' })
    const body = (typeof req.body === 'object' && req.body) || {}
    const content = String((body as any).kubeconfig || '')
    if (!content) return res.status(400).json({ ok: false, error: 'kubeconfig required' })
    const dir = path.join(stateBaseDir(), 'kube')
    try {
      fs.mkdirSync(dir, { recursive: true })
    } catch {}
    const p = path.join(dir, `${name}.config`)
    fs.writeFileSync(p, content)
    res.json({ ok: true, path: p })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// Talosconfig management for orgs (status + upload)
app.get('/api/orgs/:name/talosconfig/status', async (req, res) => {
  try {
    const name = String(req.params.name || '').trim()
    if (!name) return res.status(400).json({ ok: false, error: 'bad name' })
    const p = path.join(stateBaseDir(), 'talos', `${name}.talosconfig`)
    const existsOnDisk = fs.existsSync(p)
    let placeholder = false
    let valid = false
    if (existsOnDisk) {
      try {
        const text = fs.readFileSync(p, 'utf8')
        const meaningful = text.split(/\r?\n/).some((ln) => ln.trim() && !ln.trim().startsWith('#'))
        placeholder = /GENERATED_PLACEHOLDER/i.test(text) || /PLACEHOLDER-(CA|CRT|KEY)/i.test(text)
        valid = meaningful && /contexts?:/i.test(text) && !placeholder
      } catch {}
    }
    res.json({ ok: true, exists: existsOnDisk, placeholder, valid, path: existsOnDisk ? p : '' })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})
app.post('/api/orgs/:name/talosconfig', async (req, res) => {
  if ((req.headers['x-auth-token'] as string) !== TOKEN)
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  try {
    const name = String(req.params.name || '').trim()
    if (!name) return res.status(400).json({ ok: false, error: 'bad name' })
    const body = (typeof req.body === 'object' && req.body) || {}
    const content = String((body as any).talosconfig || '')
    if (!content) return res.status(400).json({ ok: false, error: 'talosconfig required' })
    const dir = path.join(stateBaseDir(), 'talos')
    try {
      fs.mkdirSync(dir, { recursive: true })
    } catch {}
    const p = path.join(dir, `${name}.talosconfig`)
    fs.writeFileSync(p, content)
    res.json({ ok: true, path: p })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// Generate kubeconfig for an org by proxying to the orchestrator
app.post('/api/orgs/:name/kubeconfig/generate', async (req, res) => {
  if ((req.headers['x-auth-token'] as string) !== TOKEN)
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  try {
    const name = String(req.params.name || '').trim()
    if (!name) return res.status(400).json({ ok: false, error: 'bad name' })
    const body = (typeof req.body === 'object' && req.body) || {}
    const endpoint = String((body as any).endpoint || '').trim()
    if (!endpoint) return res.status(400).json({ ok: false, error: 'endpoint required' })
    // Require a real Talosconfig for this org before asking orchestrator to generate kubeconfig
    try {
      const talosPath = path.join(stateBaseDir(), 'talos', `${name}.talosconfig`)
      if (!fs.existsSync(talosPath)) {
        return res.status(400).json({
          ok: false,
          error: `talosconfig not found for org '${name}'. Upload a valid talosconfig in Org Manager before generating kubeconfig.`,
        })
      }
      const text = fs.readFileSync(talosPath, 'utf8')
      const meaningful = text.split(/\r?\n/).some((ln) => ln.trim() && !ln.trim().startsWith('#'))
      const looksTalos = /contexts?:/i.test(text)
      if (!meaningful || !looksTalos) {
        return res.status(400).json({
          ok: false,
          error: `talosconfig for org '${name}' appears empty or invalid. Replace it with a valid talosconfig (contains contexts) and retry.`,
        })
      }
    } catch {}
    const headers: Record<string, string> = ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
    const out = await fetchJSON(`${getOrchBase()}/kubeconfig/generate`, {
      method: 'POST',
      headers,
      body: { org: name, endpoint },
    })
    // Reflect orchestrator response directly
    res.json(out)
  } catch (e) {
    const msg = String(e)
    if (/talos config file is empty|failed to resolve configuration context/i.test(msg)) {
      return res.status(400).json({
        ok: false,
        error:
          'Talos configuration is missing or invalid. Upload a valid talosconfig for this org, then retry kubeconfig generation.',
        details: msg,
      })
    }
    res.status(502).json({ ok: false, error: msg })
  }
})

// Bootstrap an org cluster end-to-end using orchestrator (talosctl gen/apply/bootstrap)
app.post('/api/orgs/:name/bootstrap', async (req, res) => {
  if ((req.headers['x-auth-token'] as string) !== TOKEN)
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  const org = String(req.params.name || '').trim()
  if (!org) return res.status(400).json({ ok: false, error: 'bad name' })
  const body = (typeof req.body === 'object' && req.body) || {}
  const cpNodes: string[] = Array.isArray((body as any).cpNodes) ? (body as any).cpNodes : []
  const workerNodes: string[] = Array.isArray((body as any).workerNodes)
    ? (body as any).workerNodes
    : []
  if (!cpNodes.length) return res.status(400).json({ ok: false, error: 'cpNodes required' })

  // 1) Try orchestrator path first (forward upstream status codes verbatim)
  try {
    const headers: Record<string, string> = getOrchAuthHeader()
    const upstream = await fetch(`${getOrchBase()}/orgs/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ org, cpNodes, workerNodes }),
    } as any)
    const text = await upstream.text()
    let payload: any
    try {
      payload = JSON.parse(text)
    } catch {
      payload = { ok: upstream.ok, text }
    }
    if (upstream.ok) return res.status(200).json(payload)
    // Propagate 4xx/5xx from orchestrator instead of masking as 502
    const code = Math.max(400, Math.min(599, upstream.status || 502))
    return res
      .status(code)
      .json(
        payload && typeof payload === 'object'
          ? payload
          : { ok: false, error: text || 'orchestrator bootstrap failed' }
      )
  } catch (e: any) {
    // Network or unexpected error – keep as 502
    const msg = e?.message ? String(e.message) : String(e)
    return res.status(502).json({ ok: false, error: msg || 'orchestrator bootstrap failed' })
  }
})
// removed unused agentChats

// __dirname replacement for ESM
const here = path.dirname(new URL(import.meta.url).pathname)
// If UI_DEV=1, proxy /ui to the Vite dev server (no build needed)
const UI_DEV = process.env.UI_DEV === '1'
if (UI_DEV) {
  const viteTarget = process.env.VITE_DEV_URL || 'https://localhost:5173'
  app.use('/ui', (req, res) => {
    proxy.web(req, res, { target: viteTarget, changeOrigin: true, xfwd: true, secure: false })
  })
} else {
  // Serve built UI if available (Vite build outputs to ui/dist)
  const builtUiDir = path.join(here, '..', 'ui', 'dist')
  const srcUiDir = path.join(here, '..', 'ui')
  if (fs.existsSync(builtUiDir)) {
    app.use('/ui', express.static(builtUiDir))
  } else {
    // Fallback: serve raw UI sources (useful before first build)
    app.use('/ui', express.static(srcUiDir))
  }
}

// Reverse proxy to embed local editors (HTTP)
app.use('/embed/local/:port', (req, res) => {
  const port = Number(req.params.port)
  if (!port || Number.isNaN(port)) return res.status(400).end('bad port')
  const target = `http://host.docker.internal:${port}`
  // rewrite path: /embed/local/:port/(.*) -> /$1
  const rest = req.url.replace(/^\/embed\/local\/\d+/, '') || '/'
  ;(req as any).url = rest
  ;(req as any)._embedBase = `/embed/local/${port}`
  const hdrs: any = { [CS_AUTH_HEADER]: CS_AUTH_TOKEN }
  if (req.headers.origin) hdrs.origin = String(req.headers.origin)
  proxy.web(req, res, { target, changeOrigin: true, xfwd: true, headers: hdrs })
})

// Reverse proxy to embed editors forwarded inside orchestrator container
app.use('/embed/orchestrator/:port', (req, res) => {
  const port = Number(req.params.port)
  if (!port || Number.isNaN(port)) return res.status(400).end('bad port')
  const orchBase = getOrchBase()
  const target = `${orchBase}/editor/proxy/${port}`
  const rest = req.url.replace(/^\/embed\/orchestrator\/(\d+)/, '') || '/'
  ;(req as any).url = rest
  ;(req as any)._embedBase = `/embed/orchestrator/${port}`
  const hdrs: any = Object.assign(
    { [CS_AUTH_HEADER]: CS_AUTH_TOKEN },
    ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
  )
  if (req.headers.origin) hdrs.origin = String(req.headers.origin)
  proxy.web(req, res, { target, changeOrigin: true, xfwd: true, headers: hdrs, secure: false })
})

app.use((req, res, next) => {
  const safe = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS'
  if (!safe) {
    if (
      process.env.NODE_ENV !== 'production' &&
      (req.path.startsWith('/api/debug') || req.path.startsWith('/api/editor'))
    ) {
      return next()
    }
    if (req.headers['x-auth-token'] !== TOKEN)
      return res.status(401).json({ error: 'unauthorized' })
  }
  next()
})

app.get('/api/health', (req, res) => res.json({ status: 'ok' }))
app.get('/api/state', async (req, res) => {
  try {
    const headers: Record<string, string> = ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
    const base = getOrchBase()
    const [tasks, agents] = await Promise.all([
      fetchJSON(`${base}/tasks`, { headers }),
      fetchJSON(`${base}/agents`, { headers }),
    ])
    let pr: any = null
    try {
      const p = path.join(stateBaseDir(), 'radicle', 'last_pr.json')
      if (fs.existsSync(p)) pr = JSON.parse(fs.readFileSync(p, 'utf8'))
    } catch {}
    res.json({ tasks, agents, clusters: [], prs: pr ? [pr] : [] })
  } catch (e) {
    res.status(200).json({ tasks: [], agents: [], clusters: [], prs: [], error: String(e) })
  }
})

app.post('/api/command', (req, res) => {
  const q = (req.body && req.body.q) || ''
  res.json({ ok: true, echo: q })
})

// Editor control: proxy to orchestrator endpoints
app.post('/api/editor/open', async (req, res) => {
  try {
    const name = (req.body && req.body.name) || ''
    const org = (req.body && req.body.org) || ''
    if (!name) return res.status(400).json({ error: 'missing name' })
    const headers: Record<string, string> = ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
    const out = await fetchJSON(`${getOrchBase()}/agents/editor/open`, {
      method: 'POST',
      headers,
      body: { name, org },
    })
    res.json(out)
  } catch (e) {
    res.status(502).json({ error: String(e) })
  }
})
app.post('/api/editor/close', async (req, res) => {
  try {
    const name = (req.body && req.body.name) || ''
    if (!name) return res.status(400).json({ error: 'missing name' })
    const headers: Record<string, string> = ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
    const out = await fetchJSON(`${getOrchBase()}/agents/editor/close`, {
      method: 'POST',
      headers,
      body: { name },
    })
    res.json(out)
  } catch (e) {
    res.status(502).json({ error: String(e) })
  }
})

// Chat APIs
app.get('/api/chat', (req, res) => {
  res.json({ messages: chats.global })
})
app.post('/api/chat', async (req, res) => {
  const org = (req.body && req.body.org) || 'acme'
  const text = (req.body && req.body.text) || ''
  chats.global.push({ role: 'user', text })
  try {
    const headers: Record<string, string> = ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
    const body = { org, task: text }
    const out = await fetchJSON(`${getOrchBase()}/schedule`, { method: 'POST', headers, body })
    // Trigger agent deployment for this org (best-effort)
    let deployResult: any = null
    try {
      deployResult = await fetchJSON(`${getOrchBase()}/agents/deploy`, {
        method: 'POST',
        headers,
        body: { org },
      })
    } catch (e: any) {
      deployResult = { ok: false, error: String(e?.message || e) }
      try {
        console.error('[deploy] error', deployResult)
      } catch {}
    }
    chats.global.push({ role: 'system', text: `scheduled task ${out.id || ''}` })
    res.json({ ok: true, task: out, deploy: deployResult })
  } catch (e) {
    res.status(502).json({ error: String(e) })
  }
})

// Proxy: task/agent logs and SSE streams expected by UI
app.get('/api/taskLogs', async (req, res) => {
  const id = String(req.query.id || '')
  if (!id) return res.status(400).json({ error: 'missing id' })
  try {
    const headers: Record<string, string> = ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
    const out = await fetchJSON(`${getOrchBase()}/tasks/logs?id=${encodeURIComponent(id)}`, {
      headers,
    })
    res.json(out)
  } catch (e) {
    res.status(502).json({ error: String(e) })
  }
})
// Task status and cancel proxies
app.get('/api/taskStatus', async (req, res) => {
  const id = String(req.query.id || '')
  if (!id) return res.status(400).json({ error: 'missing id' })
  try {
    const headers: Record<string, string> = ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
    const out = await fetchJSON(`${getOrchBase()}/tasks/status?id=${encodeURIComponent(id)}`, {
      headers,
    })
    res.json(out)
  } catch (e) {
    res.status(502).json({ error: String(e) })
  }
})
app.post('/api/task/cancel', async (req, res) => {
  try {
    const id = (req.body && String(req.body.id || '').trim()) || ''
    if (!id) return res.status(400).json({ error: 'missing id' })
    const headers: Record<string, string> = ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
    const out = await fetchJSON(`${getOrchBase()}/tasks/cancel`, {
      method: 'POST',
      headers,
      body: { id },
    })
    res.json(out)
  } catch (e) {
    res.status(502).json({ error: String(e) })
  }
})
app.get('/api/agentLogs', async (req, res) => {
  const name = String(req.query.name || '')
  if (!name) return res.status(400).json({ error: 'missing name' })
  try {
    const headers: Record<string, string> = ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
    const out = await fetchJSON(`${getOrchBase()}/agents/logs?name=${encodeURIComponent(name)}`, {
      headers,
    })
    res.json(out)
  } catch (e) {
    res.status(502).json({ error: String(e) })
  }
})

// Namespace prepare proxy
app.post('/api/k8s/prepare', async (req, res) => {
  try {
    const org = (req.body && String(req.body.org || '').trim()) || ''
    const namespace = (req.body && String(req.body.namespace || '').trim()) || ''
    if (!org) return res.status(400).json({ error: 'missing org' })
    const headers: Record<string, string> = ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
    const out = await fetchJSON(`${getOrchBase()}/k8s/prepare`, {
      method: 'POST',
      headers,
      body: { org, namespace },
    })
    res.json(out)
  } catch (e) {
    res.status(502).json({ error: String(e) })
  }
})

// Deploy orchestrator into a cluster via kubectl apply and wait for readiness
app.post('/api/k8s/orchestrator/deploy', async (req, res) => {
  try {
    const org = (req.body && String(req.body.org || '').trim()) || ''
    if (!org) return res.status(400).json({ error: 'missing org' })
    const repoRoot = path.resolve(path.dirname(here), '..', '..')
    const manifest = path.join(repoRoot, 'src', 'k8s', 'orchestrator', 'deployment.yaml')
    // Resolve kubeconfig for this org
    const kubeCfg = path.join(stateBaseDir(), 'kube', `${org}.config`)
    if (!fs.existsSync(kubeCfg)) {
      return res.status(400).json({
        ok: false,
        error: `kubeconfig not found for org '${org}': ${kubeCfg}. Upload or generate it first.`,
      })
    }
    // Quick connectivity preflight (API server reachable?)
    // Use a compatibility sequence for different kubectl versions; best-effort only
    const tryCmd = async (args: string[]) =>
      await runQuick('kubectl', ['--kubeconfig', kubeCfg, ...args])
    let preOk = false
    let last = { code: 1, out: '' }
    for (const args of [
      ['version', '-o', 'json'],
      ['cluster-info'],
      ['get', 'ns', 'default', '--request-timeout=10s'],
      ['auth', 'can-i', 'get', 'namespaces', '-A', '--request-timeout=10s'],
    ]) {
      last = await tryCmd(args)
      if (last.code === 0) {
        preOk = true
        break
      }
    }
    if (!preOk) {
      const msg = (last.out || '').toString()
      const softOk =
        /couldn\'t get current server API group list|the server could not find the requested resource|NotFound/i.test(
          msg
        )
      const kubectlMissing = /command not found|kubectl: not found/i.test(msg)
      if (kubectlMissing) {
        return res.status(500).json({ ok: false, error: 'kubectl not found on PATH' })
      }
      // If API group list is not ready or other transient NotFound, continue to apply and let it decide
      if (!softOk) {
        // Proceed but include a warning in response if apply succeeds
        try {
          console.warn('[deploy preflight] non-fatal kubectl error:', msg)
        } catch {}
      }
    }
    // Explicit API discovery check: list api-resources to ensure server is a Kubernetes API
    let apiRes = await tryCmd(['api-resources', '-o', 'name', '--request-timeout=10s'])
    if (apiRes.code !== 0) {
      // If kubeconfig appears to be a placeholder (e.g., https://127.0.0.1:6443 and refused), try importing user's current kubectl context automatically.
      const outText = (apiRes.out || '').toString()
      const looksRefused = /127\.0\.0\.1:6443|connection refused|dial tcp/i.test(outText)
      let imported = false
      if (looksRefused) {
        const kc = await runQuick('kubectl', [
          'config',
          'view',
          '--minify',
          '--flatten',
          '-o',
          'yaml',
        ])
        if (kc.code === 0 && /apiVersion:\s*v1/i.test(kc.out) && /kind:\s*Config/i.test(kc.out)) {
          try {
            fs.writeFileSync(kubeCfg, kc.out)
            imported = true
          } catch {}
        }
        if (imported) {
          // Retry discovery once with the imported kubeconfig
          apiRes = await tryCmd(['api-resources', '-o', 'name', '--request-timeout=10s'])
        }
      }
      if (apiRes.code !== 0) {
        let serverUrl = ''
        let text = ''
        try {
          text = fs.readFileSync(kubeCfg, 'utf8')
          const m = text.match(/\bserver:\s*(\S+)/)
          if (m) serverUrl = m[1]
        } catch {}
        // If kubeconfig points to 0.0.0.0:PORT, rewrite to 127.0.0.1:PORT and retry once.
        try {
          const m2 = serverUrl.match(/^https?:\/\/(0\.0\.0\.0):(\d+)/)
          if (m2) {
            const port = m2[2]
            const patched = text.replace(
              /(\bserver:\s*)https?:\/\/0\.0\.0\.0:(\d+)/,
              `$1https://127.0.0.1:${port}`
            )
            if (patched && patched !== text) {
              fs.writeFileSync(kubeCfg, patched)
              apiRes = await tryCmd(['api-resources', '-o', 'name', '--request-timeout=10s'])
              if (apiRes.code === 0) {
                serverUrl = `https://127.0.0.1:${port}`
              } else {
                // restore original to avoid confusion
                fs.writeFileSync(kubeCfg, text)
              }
            }
          }
        } catch {}
        // If still failing, return error to caller with hints.
        return res.status(400).json({
          ok: false,
          error:
            'Kubernetes API discovery failed for this kubeconfig. Verify the kubeconfig points to a running Kubernetes API server (not a Talos endpoint), and that your user has permissions to list API resources.',
          details: outText.slice(0, 500),
          kubeconfig: kubeCfg,
          server: serverUrl || undefined,
          attemptedImport: looksRefused ? 'kubectl current-context' : undefined,
        })
      }
    }
    // Apply manifests using org kubeconfig
    const apply = await runQuick('kubectl', [
      '--kubeconfig',
      kubeCfg,
      'apply',
      '-f',
      manifest,
      '-n',
      'mvp-agents',
      '--validate=false',
    ])
    if (apply.code !== 0) {
      const out = (apply.out || '').toString()
      if (/unable to recognize|the server could not find the requested resource/i.test(out)) {
        let serverUrl = ''
        try {
          const text = fs.readFileSync(kubeCfg, 'utf8')
          const m = text.match(/\bserver:\s*(\S+)/)
          if (m) serverUrl = m[1]
        } catch {}
        return res.status(400).json({
          ok: false,
          error:
            'Kubernetes API did not recognize resource kinds. Ensure this kubeconfig targets a healthy Kubernetes cluster and not a Talos management endpoint. The API must be reachable and support core/apps resources.',
          details: out.slice(0, 1000),
          kubeconfig: kubeCfg,
          server: serverUrl || undefined,
        })
      }
      return res.status(500).json({ ok: false, error: out })
    }
    // Wait for Deployment rollout
    const rollout = await runQuick('kubectl', [
      '--kubeconfig',
      kubeCfg,
      'rollout',
      'status',
      'deployment/orchestrator',
      '-n',
      'mvp-agents',
      '--timeout=60s',
    ])
    if (rollout.code !== 0) return res.status(500).json({ ok: false, error: rollout.out })
    // Return service URL (cluster DNS) and token hint
    const url = 'http://orchestrator.mvp-agents.svc.cluster.local:8080'
    res.json({ ok: true, url })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// Setup status: check/persist Tailscale connectivity
app.get('/api/setup/status', async (req, res) => {
  try {
    const db = await getDB()
    // fast path: return persisted state if recent
    const row = await db.get('SELECT value FROM kv WHERE key=?', 'tailscale_connected')
    const persisted = row ? row.value === '1' : false
    if (persisted) return res.json({ ok: true, connected: true })

    // Probe tailscale; "tailscale status --json" or fallback to Headscale /health
    let connected = false
    try {
      const out = await new Promise<string>((resolve, reject) => {
        const p = spawn('tailscale', ['status', '--json'])
        let buf = ''
        p.stdout.on('data', (d) => (buf += String(d)))
        p.stderr.on('data', (d) => (buf += String(d)))
        p.on('close', (code) =>
          code === 0 ? resolve(buf) : reject(new Error(buf || String(code)))
        )
      })
      try {
        const j = JSON.parse(out)
        connected = Boolean(j && j.Self && j.Self.TailAddr)
      } catch {
        connected = /relay|wgpeer|hostinfo/i.test(out)
      }
    } catch {
      const hsUrl = process.env.HEADSCALE_URL
      if (hsUrl) {
        try {
          const health = await fetchJSON(hsUrl.replace(/\/$/, '') + '/health').catch(() => ({}))
          connected = Boolean(health && (health.status === 'pass' || health.status === 'ok'))
        } catch {}
      }
    }

    // persist only positive detection; do not downgrade sticky state here
    if (connected) {
      try {
        await db.run(
          'INSERT INTO kv(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP',
          'tailscale_connected',
          '1'
        )
      } catch {}
    }

    res.json({ ok: true, connected })
  } catch (e) {
    res.status(200).json({ ok: false, connected: false, error: String(e) })
  }
})

// Provision an org end-to-end: Talos bootstrap via orchestrator then deploy orchestrator in-cluster.
app.get('/api/orgs/:name/provision/stream', async (req, res) => {
  // Allow token via header or query (EventSource cannot set headers)
  const qtok = (req.query && (req.query as any).token) || ''
  const presented = (req.headers['x-auth-token'] as string) || String(qtok || '')
  if (presented !== TOKEN) return res.status(401).end('unauthorized')

  const org = String(req.params.name || '').trim()
  if (!org) return res.status(400).end('bad org')
  // Optional node lists via query (space or comma separated)
  const cpRaw = String((req.query as any).cpNodes || '')
  const wkRaw = String((req.query as any).workerNodes || '')
  let cpNodes: string[] = cpRaw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  let workerNodes: string[] = wkRaw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  const send = (event: string, data: any) => {
    try {
      res.write(`event: ${event}\n`)
      res.write(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`)
    } catch {}
  }
  const done = (ok: boolean, extra?: any) => {
    send('done', { ok, ...(extra || {}) })
    res.end()
  }

  // Helper: discover nodes via tailscale naming/tagging conventions
  async function discoverNodes() {
    try {
      const r = await runQuick('tailscale', ['status', '--json'], { timeoutMs: 6000 })
      if (r.code !== 0 || !r.out) return
      const j = JSON.parse(r.out)
      const peers = (j && (j.Peers || j.Peer || [])) || []
      const self = j && j.Self ? [j.Self] : []
      const all = Array.isArray(peers) ? peers.concat(self) : self
      const nameMatches = (hn: string, pref: string) => hn.toLowerCase().startsWith(pref)
      const tagsOf = (p: any) => (p && (p.Tags || p.Tag || p.forcedTags || [])) || []
      const ipv4 = (p: any): string =>
        p && (p.TailscaleIPs || p.TailscaleIP || p.TailAddr || [])
          ? Array.isArray(p.TailscaleIPs)
            ? p.TailscaleIPs.find((x: string) => x.includes('.')) || ''
            : String(p.TailAddr || '').includes('.')
              ? String(p.TailAddr)
              : ''
          : ''
      if (!cpNodes.length || !workerNodes.length) {
        const cp: string[] = [...cpNodes]
        const wk: string[] = [...workerNodes]
        for (const p of all) {
          const hn = String((p && (p.HostName || p.Hostname || p.DNSName || '')) || '')
          const ip = ipv4(p)
          if (!ip) continue
          if (nameMatches(hn, `${org}-cp-`)) cp.push(ip)
          else if (nameMatches(hn, `${org}-worker-`)) wk.push(ip)
        }
        if (!cp.length || !wk.length) {
          for (const p of all) {
            const ip = ipv4(p)
            if (!ip) continue
            const tags = tagsOf(p).map((t: any) => String(t))
            if (!cp.length && tags.some((t: any) => /(^|:)cp($|:)/i.test(t))) cp.push(ip)
            if (!wk.length && tags.some((t: any) => /(^|:)worker($|:)/i.test(t))) wk.push(ip)
          }
        }
        cpNodes = Array.from(new Set(cp))
        workerNodes = Array.from(new Set(wk))
      }
    } catch (e: any) {
      send('log', `discovery error: ${String(e?.message || e)}`)
    }
  }

  try {
    send('begin', { org })
    send('status', 'Discovering nodes…')
    await discoverNodes()
    if (!cpNodes.length) {
      send('error', `No control-plane nodes discovered for '${org}'. Name nodes '${org}-cp-*' or tag with 'cp'.`)
      return done(false)
    }
    send('status', `Using cpNodes=${cpNodes.join(' ')} workerNodes=${workerNodes.join(' ')}`)

    // Bootstrap via orchestrator
    send('step', { title: 'Talos bootstrap via orchestrator' })
    try {
      const headers: Record<string, string> = getOrchAuthHeader()
      const upstream = await fetch(`${getOrchBase()}/orgs/bootstrap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ org, cpNodes, workerNodes }),
      } as any)
      const text = await upstream.text()
      if (!upstream.ok) {
        send('stepError', { title: 'Talos bootstrap via orchestrator', code: upstream.status })
        send('error', text)
        return done(false)
      }
      let payload: any = {}
      try { payload = JSON.parse(text) } catch { payload = { text } }
      send('stepDone', { title: 'Talos bootstrap via orchestrator', code: 0, payload })
    } catch (e: any) {
      send('stepError', { title: 'Talos bootstrap via orchestrator', code: 1 })
      send('error', String(e?.message || e))
      return done(false)
    }

    // Deploy orchestrator into the cluster
    send('step', { title: 'Deploy orchestrator to cluster' })
    try {
      const hereDir = path.dirname(new URL(import.meta.url).pathname)
      const repoRoot = path.resolve(hereDir, '..', '..')
      const manifest = path.join(repoRoot, 'src', 'k8s', 'orchestrator', 'deployment.yaml')
      const kubeCfg = path.join(stateBaseDir(), 'kube', `${org}.config`)
      const apply = await runQuick('kubectl', [
        '--kubeconfig',
        kubeCfg,
        'apply',
        '-f',
        manifest,
        '-n',
        'mvp-agents',
        '--validate=false',
      ])
      if (apply.code !== 0) {
        send('stepError', { title: 'Deploy orchestrator to cluster', code: apply.code })
        send('error', (apply.out || '').toString().slice(0, 1000))
        return done(false)
      }
      const rollout = await runQuick('kubectl', [
        '--kubeconfig',
        kubeCfg,
        'rollout',
        'status',
        'deployment/orchestrator',
        '-n',
        'mvp-agents',
        '--timeout=60s',
      ])
      if (rollout.code !== 0) {
        send('stepError', { title: 'Deploy orchestrator to cluster', code: rollout.code })
        send('error', (rollout.out || '').toString().slice(0, 1000))
        return done(false)
      }
      const url = 'http://orchestrator.mvp-agents.svc.cluster.local:8080'
      send('stepDone', { title: 'Deploy orchestrator to cluster', code: 0, url })
      // Hint the UI with orchestrator URL
      send('hint', `Orchestrator service: ${url}`)
    } catch (e: any) {
      send('stepError', { title: 'Deploy orchestrator to cluster', code: 1 })
      send('error', String(e?.message || e))
      return done(false)
    }

    done(true)
  } catch (e: any) {
    send('error', String(e?.message || e))
    done(false)
  }
})
// SSE proxy: agents
app.get('/api/stream/agent', (req, res) => {
  const name = String(req.query.name || '')
  if (!name) return res.status(400).end('missing name')
  const headers: Record<string, string> = {}
  if (ORCH_TOKEN) headers['X-Auth-Token'] = ORCH_TOKEN
  const targetUrl = new URL(`${getOrchBase()}/events/agents?name=${encodeURIComponent(name)}`)
  const lib = targetUrl.protocol === 'https:' ? https : http
  const r = lib.request(
    {
      method: 'GET',
      hostname: targetUrl.hostname,
      port: Number(targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80)),
      path: targetUrl.pathname + targetUrl.search,
      headers,
    },
    (rr) => {
      res.writeHead(rr.statusCode || 200, rr.headers)
      rr.pipe(res)
    }
  )
  r.on('error', () => res.end())
  r.end()
})

// Streaming chat: minimal SSE emitting status + scheduling + done
app.get('/api/chat/stream', async (req, res) => {
  const org = String(req.query.org || 'acme')
  const text = String(req.query.text || '')
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  const send = (event: string, data: string) => {
    res.write(`event: ${event}\n`)
    res.write(`data: ${data}\n\n`)
  }
  send('message', 'Thinking about your request…')
  try {
    const headers: Record<string, string> = ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
    const body = { org, task: text }
    const task = await fetchJSON(`${getOrchBase()}/schedule`, { method: 'POST', headers, body })
    send('task', JSON.stringify(task))
    // Best-effort deploy an agent for this org
    try {
      const deploy = await fetchJSON(`${getOrchBase()}/agents/deploy`, {
        method: 'POST',
        headers,
        body: { org },
      })
      const ok = Boolean((deploy as any)?.ok)
      if (ok) {
        send('message', 'Task scheduled; agent deployment started.')
      } else {
        send('message', 'Task scheduled; deploy returned an error.')
      }
      send('agent', JSON.stringify(deploy))
    } catch (e: any) {
      send('message', `Deploy error: ${String(e?.message || e)}`)
    }
  } catch (e) {
    send('message', `Error: ${String(e)}`)
  }
  send('done', '1')
  res.end()
})

// Debug SSE: emits initial state and periodic heartbeats so UI can log diagnostics in dev
app.get('/api/debug/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  const send = (event: string, data: any) => {
    res.write(`event: ${event}\n`)
    res.write(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`)
  }
  try {
    const headers: Record<string, string> = ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
    const [health, tasks, agents] = await Promise.all([
      fetchJSON(`${ORCH_URL}/health`, { headers }).catch((e) => ({ error: String(e) })),
      fetchJSON(`${ORCH_URL}/tasks`, { headers }).catch((e) => ({ error: String(e), tasks: [] })),
      fetchJSON(`${ORCH_URL}/agents`, { headers }).catch((e) => ({ error: String(e), agents: [] })),
    ])
    const home = process.env.HOME || '/root'
    send('config', {
      server: 'dashboard',
      port: PORT,
      orch: ORCH_URL,
      orchTokenSet: Boolean(ORCH_TOKEN),
      uiDev: UI_DEV,
      corsOrigins: ALLOW_ORIGINS,
      kubeconfigHints: {
        statePath: `${stateBaseDir()}/kube/<org>.config`,
        homePath: `${home}/.kube/<org>.config`,
      },
    })
    send('status', { message: 'connected' })
    send('health', health)
    send('state', { tasks, agents })
  } catch (e) {
    send('error', String(e))
  }
  const iv = setInterval(async () => {
    send('heartbeat', Date.now())
    try {
      const headers: Record<string, string> = ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
      const [tasks, agents] = await Promise.all([
        fetchJSON(`${ORCH_URL}/tasks`, { headers }).catch((e) => ({ error: String(e), tasks: [] })),
        fetchJSON(`${ORCH_URL}/agents`, { headers }).catch((e) => ({
          error: String(e),
          agents: [],
        })),
      ])
      send('state', { tasks, agents })
    } catch (e) {
      send('error', String(e))
    }
  }, 5000)
  req.on('close', () => clearInterval(iv))
})

// One-shot debug status
app.get('/api/debug', async (req, res) => {
  try {
    const headers: Record<string, string> = ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
    const base = getOrchBase()
    const [health, tasks, agents] = await Promise.all([
      fetchJSON(`${base}/health`, { headers }).catch((e) => ({ error: String(e) })),
      fetchJSON(`${base}/tasks`, { headers }).catch((e) => ({ error: String(e), tasks: [] })),
      fetchJSON(`${base}/agents`, { headers }).catch((e) => ({ error: String(e), agents: [] })),
    ])
    res.json({ ok: true, health, tasks, agents, server: { port: PORT, orch: base } })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// Update orchestrator URL at runtime (dev-only). Not persisted; for convenience in UI flows.
app.post('/api/debug/orchestrator-url', (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(405).json({ error: 'disabled' })
  try {
    const url = (req.body && String((req.body as any).url || '').trim()) || ''
    if (!url) return res.status(400).json({ error: 'missing url' })
    ;(global as any).__ORCH_OVERRIDE__ = url
    res.json({ ok: true, url })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// Validate setup prerequisites and env; returns guidance list
app.post('/api/setup/validate', (req, res) => {
  const presented = (req.headers['x-auth-token'] as string) || ''
  if (presented !== TOKEN) return res.status(401).json({ ok: false, error: 'unauthorized' })
  const issues: string[] = []
  const critical: string[] = []
  const add = (cond: any, msg: string, isCritical = false) => {
    if (!cond) (isCritical ? critical : issues).push(msg)
  }
  // Non-critical env hints
  add(process.env.DASHBOARD_TOKEN, 'DASHBOARD_TOKEN not set (using default)', false)
  add(
    process.env.ORCHESTRATOR_TOKEN,
    'ORCHESTRATOR_TOKEN not set (some features may be limited)',
    false
  )
  // Tailscale/Headscale (allow UI overrides)
  const body = (typeof req.body === 'object' && req.body) || {}
  const flow: 'create' | 'connect' = body.flow === 'create' ? 'create' : 'connect'
  const hsUrl = body.HEADSCALE_URL || ''
  const tsKey = body.TS_AUTHKEY || ''
  const tsHost = body.TS_HOSTNAME || ''
  // For connect, require HS URL + TS key + hostname
  if (flow === 'connect') {
    add(hsUrl, 'HEADSCALE_URL not set', true)
    add(tsKey, 'TS_AUTHKEY not set (or expired)', true)
    add(tsHost, 'TS_HOSTNAME not set', true)
  } else {
    // For create (local): only hostname is required; HS_URL and keys can be derived/generated
    add(tsHost, 'TS_HOSTNAME not set', true)
  }
  // Operator creds are configured elsewhere; not blocking setup here.
  res.json({ ok: critical.length === 0, issues: [...critical, ...issues] })
})

// ... existing streaming chat and SSE proxy endpoints kept in JS version (migrating incrementally) ...

if (import.meta.url === `file://${process.argv[1]}`) {
  // Load HTTPS certs for dev
  const here = path.dirname(new URL(import.meta.url).pathname)
  const certDir = path.resolve(here, '..', 'certs')
  const keyPath = path.join(certDir, 'dashboard.key')
  const crtPath = path.join(certDir, 'dashboard.crt')
  const httpsOpts = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(crtPath) }
  const server = https
    .createServer(httpsOpts, app)
    .listen(PORT, () => console.log(`dashboard (https) on :${PORT}`))
  server.on('upgrade', (req: any, socket, head) => {
    try {
      const url = new URL(req.url, 'http://localhost')
      if (UI_DEV && url.pathname.startsWith('/ui')) {
        const target = process.env.VITE_DEV_URL || 'http://localhost:5173'
        proxy.ws(req, socket, head, {
          target,
          changeOrigin: true,
          xfwd: true,
          headers: { origin: target },
          secure: false,
        })
        return
      }
      const m = url.pathname.match(/^\/embed\/local\/(\d+)(\/.*)?$/)
      if (m) {
        const port = Number(m[1])
        const rest = m[2] || '/'
        req.url = rest
        const target = `http://host.docker.internal:${port}`
        {
          const hdrs: any = { [CS_AUTH_HEADER]: CS_AUTH_TOKEN, origin: target }
          try {
            ;(req as any).headers['x-forwarded-proto'] = 'https'
          } catch {}
          proxy.ws(req, socket, head, {
            target,
            changeOrigin: true,
            xfwd: true,
            headers: hdrs,
            secure: false,
          })
        }
        return
      }
      const m2 = url.pathname.match(/^\/embed\/orchestrator\/(\d+)(\/.*)?$/)
      if (m2) {
        const port = Number(m2[1])
        const rest = m2[2] || '/'
        req.url = rest
        const orchBase = getOrchBase()
        const target = `${orchBase}/editor/proxy/${port}`
        {
          const wsOrigin = `http://127.0.0.1:${port}`
          const hdrs: any = Object.assign(
            { [CS_AUTH_HEADER]: CS_AUTH_TOKEN, origin: wsOrigin },
            ORCH_TOKEN ? { 'X-Auth-Token': ORCH_TOKEN } : {}
          )
          try {
            ;(req as any).headers['x-forwarded-proto'] = 'https'
          } catch {}
          proxy.ws(req, socket, head, {
            target,
            changeOrigin: true,
            xfwd: true,
            headers: hdrs,
            secure: false,
          })
        }
        return
      }
    } catch {}
    socket.destroy()
  })
}

export default app
