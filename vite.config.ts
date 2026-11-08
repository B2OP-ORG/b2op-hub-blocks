import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * `virtual:examples` — sorted list of file paths under public/examples/
 * (relative, POSIX). Contents are fetched at runtime from the public folder.
 */
function examplesList(): Plugin {
  const id = 'virtual:examples'
  const resolved = '\0' + id
  const dir = path.resolve(__dirname, 'public/examples')
  const walk = (d: string, rel = ''): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      if (e.name.startsWith('.') || e.name === '__pycache__') return []
      const r = rel ? `${rel}/${e.name}` : e.name
      return e.isDirectory() ? walk(path.join(d, e.name), r) : e.isFile() ? [r] : []
    })
  return {
    name: 'examples-list',
    resolveId: (s) => (s === id ? resolved : undefined),
    load(s) {
      if (s !== resolved) return
      let files: string[] = []
      try { files = walk(dir).sort() } catch { /* no examples folder */ }
      return `export default ${JSON.stringify(files)};`
    },
    configureServer(server) {
      server.watcher.add(dir)
      const refresh = (f: string) => {
        if (!f.startsWith(dir)) return
        const mod = server.moduleGraph.getModuleById(resolved)
        if (mod) server.reloadModule(mod)
      }
      server.watcher.on('add', refresh)
      server.watcher.on('unlink', refresh)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), examplesList()],
  worker: {
    format: 'es',
  },
})
