import fs from 'fs'
import os from 'os'
import path from 'path'

// Create an isolated HOME dir for tests so server state (~/.guildnet/state) doesn't leak
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'guildnet-home-'))
process.env.HOME = tmpHome
process.env.USERPROFILE = tmpHome

// Ensure ~/.guildnet/state exists for components that assume it
const stateDir = path.join(tmpHome, '.guildnet', 'state')
fs.mkdirSync(stateDir, { recursive: true })

// Make it visible in logs if needed
console.log('[vitest setup] HOME isolated at', tmpHome)
