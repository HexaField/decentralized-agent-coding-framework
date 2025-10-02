import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import path from 'path'
import fs from 'fs'

export default defineConfig({
  plugins: [solid()],
  root: path.resolve(__dirname),
  base: '/ui/',
  // Read .env from the dashboard folder so client shares env with server
  envDir: path.resolve(__dirname, '..'),
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
  },
  server: {
    port: 5173,
    https: {
      key: fs.readFileSync(path.resolve(__dirname, '..', 'certs', 'vite.key')),
      cert: fs.readFileSync(path.resolve(__dirname, '..', 'certs', 'vite.crt')),
    },
  },
})
