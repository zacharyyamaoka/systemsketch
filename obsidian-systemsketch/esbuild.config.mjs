import { build } from 'esbuild'
import postcss from 'postcss'
import prefixSelector from 'postcss-prefix-selector'
import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginRoot = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(pluginRoot, '..')
const dist = resolve(pluginRoot, 'dist')
const scope = '.systemsketch-obsidian-scope'
const referenceManifestPath = resolve(projectRoot, 'vscode-systemsketch', 'dist', 'app', 'app.json')
const architectureReason = [
  'Obsidian getResourcePath() gives index.html and each asset a different per-file query URL.',
  'A Vite iframe can load that HTML but its relative entry URL omits the asset query and never mounts.',
  'The supported fallback is therefore one same-document bundle of the existing EmbeddedCanvas.',
].join(' ')

const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: projectRoot,
  encoding: 'utf8',
}).trim()
const reference = JSON.parse(await readFile(referenceManifestPath, 'utf8'))
if (!reference.sourceCommit || reference.sourceCommit !== sourceCommit) {
  throw new Error(
    `Obsidian source ${sourceCommit} does not match the staged VS Code app ${reference.sourceCommit ?? 'unknown'}`,
  )
}

const inlineUrlImports = {
  name: 'inline-url-imports',
  setup(buildContext) {
    buildContext.onResolve({ filter: /\?url$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path.slice(0, -'?url'.length)),
      namespace: 'inline-url',
    }))
    buildContext.onLoad({ filter: /.*/, namespace: 'inline-url' }, async (args) => {
      const mime = {
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
      }[extname(args.path).toLowerCase()] ?? 'application/octet-stream'
      const encoded = (await readFile(args.path)).toString('base64')
      return { contents: `export default ${JSON.stringify(`data:${mime};base64,${encoded}`)}`, loader: 'js' }
    })
  },
}

const scopedCss = {
  name: 'scope-systemsketch-css',
  setup(buildContext) {
    buildContext.onLoad({ filter: /\.css$/ }, async (args) => {
      let css = await readFile(args.path, 'utf8')
      css = css.replace(/url\((["']?)(\/[^)"']+)\1\)/g, (match, _quote, assetUrl) => {
        const assetPath = join(projectRoot, 'public', assetUrl)
        if (!existsSync(assetPath)) return match
        const mime = assetUrl.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream'
        return `url("data:${mime};base64,${readFileSync(assetPath).toString('base64')}")`
      })
      const pluginCss = args.path === resolve(pluginRoot, 'src', 'plugin.css')
      if (!pluginCss) {
        css = postcss([
          prefixSelector({
            prefix: scope,
            transform(prefix, selector, prefixedSelector) {
              const bare = selector.trim()
              return bare === ':root' || bare === 'html' || bare === 'body' || bare === '#root'
                ? prefix
                : prefixedSelector
            },
          }),
        ]).process(css, { from: args.path }).css
      }
      return { contents: css, loader: 'css' }
    })
  },
}

await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })
await build({
  entryPoints: [resolve(pluginRoot, 'src', 'main.ts')],
  outfile: resolve(dist, 'main.js'),
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'chrome112',
  external: ['obsidian', 'electron'],
  jsx: 'automatic',
  define: {
    'process.env.NODE_ENV': '"production"',
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true',
    '__TLDRAW_LICENSE_KEY__': JSON.stringify(
      process.env.TLDRAW_LICENSE_KEY ?? process.env.VITE_TLDRAW_LICENSE_KEY ?? '',
    ),
    '__SYSTEMSKETCH_SOURCE_COMMIT__': JSON.stringify(sourceCommit),
  },
  loader: { '.png': 'dataurl', '.woff2': 'dataurl', '.svg': 'dataurl' },
  plugins: [inlineUrlImports, scopedCss],
  minify: true,
  sourcemap: false,
  treeShaking: true,
  logLevel: 'info',
})

await copyFile(resolve(pluginRoot, 'manifest.json'), resolve(dist, 'manifest.json'))
await copyFile(resolve(dist, 'main.css'), resolve(dist, 'styles.css'))
await writeFile(
  resolve(dist, 'bundle.json'),
  `${JSON.stringify({
    architecture: 'same-document-fallback',
    architectureReason,
    sourceCommit,
    referenceAppCommit: reference.sourceCommit,
    referenceAppChannel: reference.channel,
    referenceAppBuild: reference.stableBuild,
    matchesReferenceApp: reference.sourceCommit === sourceCommit,
  }, null, 2)}\n`,
  'utf8',
)
