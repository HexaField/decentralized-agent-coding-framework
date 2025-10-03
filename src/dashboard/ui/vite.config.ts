import { defineConfig, loadEnv } from 'vite'
import solid from 'vite-plugin-solid'
import path from 'path'
import fs from 'fs'

export default defineConfig(({ mode }) => {
  // Load env from the dashboard folder so client shares env with server
  const envRoot = path.resolve(__dirname, '..')
  const env = loadEnv(mode, envRoot, '') // load all then pick VITE_ below
  console.log(env.VITE_SERVER_URL, env.VITE_DEV_URL, env.VITE_DASHBOARD_TOKEN)

  return {
    plugins: [solid()],
    root: path.resolve(__dirname),
    base: '/ui/',
    envDir: envRoot,
    envPrefix: ['VITE_'],
    define: {
      'import.meta.env.VITE_SERVER_URL': JSON.stringify(env.VITE_SERVER_URL || ''),
      'import.meta.env.VITE_DEV_URL': JSON.stringify(env.VITE_DEV_URL || ''),
      'import.meta.env.VITE_DASHBOARD_TOKEN': JSON.stringify(env.VITE_DASHBOARD_TOKEN || ''),
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      target: 'es2020',
    },
    server: {
      port: 5173,
      https: {
        key: fs.readFileSync(path.resolve(envRoot, 'certs', 'vite.key')),
        cert: fs.readFileSync(path.resolve(envRoot, 'certs', 'vite.crt')),
      },
    },
  }
})
