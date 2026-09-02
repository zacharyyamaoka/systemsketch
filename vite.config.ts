import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { configDefaults } from 'vitest/config'

const runtimeProcess = Reflect.get(globalThis, 'process') as {
  env?: Record<string, string | undefined>
} | undefined

const apiPort = runtimeProcess?.env?.SYSTEMSKETCH_API_PORT ?? '4323'

export default defineConfig({
  plugins: [react()],
  define: {
    __TLDRAW_LICENSE_KEY__: JSON.stringify(
      runtimeProcess?.env?.TLDRAW_LICENSE_KEY
      ?? runtimeProcess?.env?.VITE_TLDRAW_LICENSE_KEY
      ?? '',
    ),
  },
  optimizeDeps: {
    exclude: ['@tldraw/assets'],
  },
  test: {
    /**
     * A track worktree under `.claude/worktrees/` is a second checkout of this
     * repo, so vitest otherwise collects its tests too — doubling the count and
     * letting an unrelated lane turn `npm run check` red here.
     */
    exclude: [...configDefaults.exclude, '**/.claude/worktrees/**'],
  },
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': `http://127.0.0.1:${apiPort}`,
    },
  },
})
