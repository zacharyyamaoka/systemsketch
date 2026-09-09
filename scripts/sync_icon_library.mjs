#!/usr/bin/env node
// Regenerate the Block icon picker's data files from their upstream packages.
//
//   node scripts/sync_icon_library.mjs                 # Lucide from node_modules/lucide-static
//   node scripts/sync_icon_library.mjs --emoji <dir>   # also emoji, from a dir holding
//                                                      # node_modules/unicode-emoji-json and
//                                                      # node_modules/emojibase-data
//
// Writes src/blocks/ui/iconPicker/data/lucide-icons.json and, with --emoji,
// src/blocks/ui/iconPicker/data/emoji.json. Both are committed: the app loads
// them lazily and must not depend on the generator's packages at runtime.
//
// WHY lucide-static rather than lucide-react's `icons` map: lucide-react is
// statically imported for the curated glyphs, so a dynamic import of the same
// module would be folded into the main chunk by rollup and the whole library
// would ship to every board. A JSON file is its own module and its own chunk.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = join(ROOT, 'src/blocks/ui/iconPicker/data')
mkdirSync(DATA_DIR, { recursive: true })

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

/** lucide-static names icons in kebab-case; lucide-react exports them in PascalCase. */
export function lucidePascalName(kebab) {
	return kebab
		.split('-')
		.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
		.join('')
}

function syncLucide() {
	const base = join(ROOT, 'node_modules/lucide-static')
	const version = readJson(join(base, 'package.json')).version
	const nodes = readJson(join(base, 'icon-nodes.json'))
	const tags = readJson(join(base, 'tags.json'))
	const icons = Object.keys(nodes)
		.sort()
		.map((kebab) => ({ name: lucidePascalName(kebab), kebab, tags: tags[kebab] ?? [], node: nodes[kebab] }))
	writeFileSync(join(DATA_DIR, 'lucide-icons.json'), JSON.stringify({ version, icons }))
	console.log(`lucide-icons.json: ${icons.length} icons from lucide-static ${version}`)
}

function syncEmoji(sourceDir) {
	const byEmoji = readJson(join(sourceDir, 'node_modules/unicode-emoji-json/data-by-emoji.json'))
	const compact = readJson(join(sourceDir, 'node_modules/emojibase-data/en/compact.json'))
	const version = readJson(join(sourceDir, 'node_modules/unicode-emoji-json/package.json')).version
	const keywordsByChar = new Map(compact.map((entry) => [entry.unicode, entry.tags ?? []]))
	const stripVariation = (char) => char.replace(/️/g, '')
	const emoji = Object.entries(byEmoji).map(([char, entry]) => {
		const keywords = (keywordsByChar.get(char) ?? keywordsByChar.get(stripVariation(char)) ?? [])
			.filter((tag) => !entry.name.includes(tag))
			.slice(0, 6)
		return { char, name: entry.name, slug: entry.slug, group: entry.group, keywords, skinTone: Boolean(entry.skin_tone_support) }
	})
	writeFileSync(join(DATA_DIR, 'emoji.json'), JSON.stringify({ version, emoji }))
	console.log(`emoji.json: ${emoji.length} emoji from unicode-emoji-json ${version} + emojibase keywords`)
}

const args = process.argv.slice(2)
const emojiAt = args.indexOf('--emoji')
if (existsSync(join(ROOT, 'node_modules/lucide-static'))) syncLucide()
else console.error('lucide-static is not installed; skipping Lucide')
if (emojiAt !== -1) syncEmoji(resolve(args[emojiAt + 1]))
