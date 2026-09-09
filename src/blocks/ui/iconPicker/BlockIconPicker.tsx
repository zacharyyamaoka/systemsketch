/**
 * Notion-style Block icon picker: Emoji / Icons / Upload tabs over the whole
 * Lucide and emoji libraries, plus a paste/drop/file upload pipeline. Ported
 * element-for-element from the live mock in `docs/build_icon_picker_proposal.py`
 * (rendered at `reports/icon-picker-proposal-*.html`) against real Notion
 * reference stills — see that report for the design record.
 *
 * WHY a real Radix `Popover`, not a hand-rolled positioned div: same reasoning
 * as `BtInsertMenu.tsx` (read its own WHY comment) — portaling through
 * tldraw's own `useContainer()` is what keeps this panel above the Block
 * cards it edits rather than trapped under them by tldraw's shape stacking,
 * and Radix's dismissable layer gives outside-click / Escape / focus-return
 * for free instead of another hand-rolled version of all four.
 *
 * WHY no colour dot, unlike the mock and unlike Notion: decided out of V1
 * (see the report's decision log) — a per-icon colour override is a real
 * feature but not this slice's; the picker only ever shows an icon in its
 * own natural ink.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Popover as RadixPopover } from 'radix-ui'
import { useContainerIfExists, useMaybeEditor } from 'tldraw'

import {
	EMOJI_FONT_FAMILY,
	EMOJI_SKIN_TONES,
	applySkinTone,
	loadEmojiLibrary,
	peekEmojiLibrary,
	type EmojiEntry,
	type EmojiLibrary,
} from './emojiLibrary'
import {
	LucideNodeSvg,
	loadLucideLibrary,
	peekLucideLibrary,
	type LucideLibrary,
	type LucideLibraryEntry,
} from './lucideLibrary'
import { type BlockIconRef } from './iconRef'
import {
	IconFetchError,
	createIconAsset,
	fetchIconFromUrl,
	prepareIconImage,
	type PreparedIconImage,
} from './uploadIcon'
import { HEADER_ICON_PX, SIMPLE_ICON_PX } from '../../layoutBlock'
import './block-icon-picker.css'

type PickerTab = 'emoji' | 'icons' | 'upload'

/** Staged Upload-tab state: nothing yet, or a prepared image waiting on Save. */
type UploadStage =
	| { kind: 'empty' }
	| { kind: 'preview'; prepared: PreparedIconImage; previewUrl: string; addToLibrary: boolean }
	| { kind: 'saving'; prepared: PreparedIconImage; previewUrl: string }
	| { kind: 'error'; message: string }

const RECENT_KEY = 'systemsketch.iconPicker.recent'
const SKIN_TONE_KEY = 'systemsketch.iconPicker.skinTone'
const RECENT_LIMIT = 12
/** Notion's promise, spelled out in the filter's own placeholder area. */
const URL_PATTERN = /^https?:\/\/\S+$/

function readRecents(): string[] {
	try {
		const raw = localStorage.getItem(RECENT_KEY)
		const parsed: unknown = raw ? JSON.parse(raw) : []
		return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
	} catch {
		return []
	}
}

function writeRecents(names: readonly string[]): void {
	try {
		localStorage.setItem(RECENT_KEY, JSON.stringify(names))
	} catch {
		// private browsing / storage disabled — recents just don't persist
	}
}

function readSkinTone(): number {
	try {
		const stored = Number(localStorage.getItem(SKIN_TONE_KEY))
		return Number.isInteger(stored) && stored >= 0 && stored < EMOJI_SKIN_TONES.length ? stored : 0
	} catch {
		return 0
	}
}

function writeSkinTone(tone: number): void {
	try {
		localStorage.setItem(SKIN_TONE_KEY, String(tone))
	} catch {
		// ditto
	}
}

const TONE_HANDS: readonly string[] = EMOJI_SKIN_TONES.map((modifier) => `✋${modifier}`)

function randomEntry<T>(list: readonly T[]): T | undefined {
	return list.length ? list[Math.floor(Math.random() * list.length)] : undefined
}

function formatBytes(bytes: number): string {
	if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
	return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function describeUpload(prepared: PreparedIconImage): string {
	if (prepared.kind === 'svg') return `SVG kept as vector · ${formatBytes(prepared.originalBytes)} stored as-is`
	return (
		`${prepared.originalWidth}×${prepared.originalHeight} ${formatBytes(prepared.originalBytes)} → `
		+ `${prepared.width}×${prepared.height} PNG ${formatBytes(prepared.storedBytes)} stored in the .systemsketch`
	)
}

export interface BlockIconPickerProps {
	value: BlockIconRef
	/** The owning Block's title, shown in the Upload preview's two faux chrome chips. */
	title: string
	disabled?: boolean
	onChange(ref: BlockIconRef): void
	/**
	 * The trigger. Uncontrolled (no `open`/`onOpenChange` below): wrapped in a
	 * real `Popover.Trigger` — click toggles, as in the inspector's icon well.
	 * Controlled: wrapped in a `Popover.Anchor` instead, so it positions the
	 * panel without becoming a second click target — the inline editor drives
	 * `open` off tldraw's own editing lifecycle and renders an invisible
	 * placement box here rather than a button.
	 */
	children?: ReactNode
	open?: boolean
	onOpenChange?(open: boolean): void
}

export function BlockIconPicker({
	value,
	title,
	disabled,
	onChange,
	children,
	open: controlledOpen,
	onOpenChange,
}: BlockIconPickerProps) {
	// WHY nullable: `BlockInspectorContent` is documented (see its own file) to
	// render outside any mounted `<Tldraw>` — development profiles and its own
	// `renderToStaticMarkup` unit tests among them — so a plain `useEditor()`
	// here would throw the moment a Block's inspector renders at all, not only
	// when the picker actually opens.
	const editor = useMaybeEditor()
	const container = useContainerIfExists()
	const controlled = controlledOpen !== undefined
	const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
	const open = controlled ? controlledOpen : uncontrolledOpen
	const setOpen = (next: boolean) => {
		onOpenChange?.(next)
		if (!controlled) setUncontrolledOpen(next)
	}

	const [tab, setTab] = useState<PickerTab>('icons')
	const [query, setQuery] = useState('')
	const [tone, setTone] = useState(() => readSkinTone())
	const [toneOpen, setToneOpen] = useState(false)
	const [recent, setRecent] = useState(() => readRecents())
	const [upload, setUpload] = useState<UploadStage>({ kind: 'empty' })
	const [lucideLib, setLucideLib] = useState<LucideLibrary | null>(() => peekLucideLibrary())
	const [emojiLib, setEmojiLib] = useState<EmojiLibrary | null>(() => peekEmojiLibrary())
	const searchRef = useRef<HTMLInputElement | null>(null)

	// WHY gated on `open`: Root/Trigger stay mounted for the picker's whole
	// life (Radix only unmounts Content), so an unconditional load here would
	// fetch the ~1,800-icon chunk the moment a Block is selected, not the
	// moment its icon picker is actually opened.
	useEffect(() => {
		if (!open || (lucideLib && emojiLib)) return
		let cancelled = false
		void Promise.all([loadLucideLibrary(), loadEmojiLibrary()]).then(([lucide, emoji]) => {
			if (cancelled) return
			setLucideLib(lucide)
			setEmojiLib(emoji)
		})
		return () => {
			cancelled = true
		}
	}, [open, lucideLib, emojiLib])

	// Reset transient UI (never the staged upload — Cancel/Back own that) each
	// time the panel opens, so a stale filter or tab doesn't survive a reopen.
	useEffect(() => {
		if (!open) return
		setTab('icons')
		setQuery('')
		setToneOpen(false)
		setUpload({ kind: 'empty' })
		const frame = requestAnimationFrame(() => searchRef.current?.focus())
		return () => cancelAnimationFrame(frame)
	}, [open])

	useEffect(() => {
		if (upload.kind === 'preview' || upload.kind === 'saving') {
			const url = upload.previewUrl
			return () => URL.revokeObjectURL(url)
		}
	}, [upload])

	const filteredIcons = useMemo<LucideLibraryEntry[]>(
		() => (lucideLib ? lucideLib.search(query) : []),
		[lucideLib, query],
	)
	const filteredEmoji = useMemo<EmojiEntry[]>(
		() => (emojiLib ? emojiLib.search(query) : []),
		[emojiLib, query],
	)
	const recentIcons = useMemo<LucideLibraryEntry[]>(() => {
		if (!lucideLib || query.trim() !== '') return []
		return recent.map((name) => lucideLib.byName.get(name)).filter((entry): entry is LucideLibraryEntry => Boolean(entry))
	}, [lucideLib, recent, query])

	const choose = (ref: BlockIconRef, options: { keepOpen?: boolean } = {}) => {
		if (ref.kind === 'lucide') {
			const next = [ref.name, ...recent.filter((name) => name !== ref.name)].slice(0, RECENT_LIMIT)
			setRecent(next)
			writeRecents(next)
		}
		onChange(ref)
		if (!options.keepOpen) setOpen(false)
	}

	const stageFile = async (file: File) => {
		try {
			const prepared = await prepareIconImage(file)
			setUpload({ kind: 'preview', prepared, previewUrl: URL.createObjectURL(prepared.file), addToLibrary: false })
			setTab('upload')
		} catch (cause) {
			setUpload({ kind: 'error', message: cause instanceof Error ? cause.message : String(cause) })
			setTab('upload')
		}
	}

	const stageUrl = async (url: string) => {
		try {
			const file = await fetchIconFromUrl(url)
			await stageFile(file)
		} catch (cause) {
			const message = cause instanceof IconFetchError ? cause.message : cause instanceof Error ? cause.message : String(cause)
			setUpload({ kind: 'error', message })
			setTab('upload')
		}
	}

	const saveUpload = async () => {
		if (upload.kind !== 'preview' || !editor) return
		setUpload({ kind: 'saving', prepared: upload.prepared, previewUrl: upload.previewUrl })
		// WHY the asset is created outside the Block command's undo step: tldraw
		// writes assets with `history: 'ignore'` (Editor.createAssets), so no
		// undo ever removes an asset record — the same as undoing one of its own
		// pasted images. One undo therefore restores the Block's previous icon in
		// a single step and the asset stays in the board as an orphan, exactly
		// like stock tldraw. Reclaiming orphans is a save-time sweep for later,
		// not an undo concern.
		const assetId = await createIconAsset(editor, upload.prepared)
		if (!assetId) {
			setUpload({ kind: 'error', message: 'the editor declined this file — try a different image' })
			setTab('upload')
			return
		}
		choose({ kind: 'asset', assetId })
	}

	// WHY a capture-phase listener on the document: tldraw registers its own
	// paste-to-canvas handler on the document in the BUBBLE phase (no capture
	// flag in useClipboardEvents), so a capture listener here runs first for
	// any paste targeting an element, and stopImmediatePropagation keeps
	// tldraw from ever seeing it. Without this a paste meant for the picker
	// also drops a second image shape onto the canvas behind it.
	useEffect(() => {
		if (!open) return
		const onPaste = (event: ClipboardEvent) => {
			const items = Array.from(event.clipboardData?.items ?? [])
			const image = items.find((item) => item.type.startsWith('image/'))
			if (image) {
				const file = image.getAsFile()
				if (file) {
					event.preventDefault()
					event.stopImmediatePropagation()
					void stageFile(file)
				}
				return
			}
			const text = event.clipboardData?.getData('text/plain')?.trim()
			if (text && URL_PATTERN.test(text)) {
				event.preventDefault()
				event.stopImmediatePropagation()
				void stageUrl(text)
			}
		}
		document.addEventListener('paste', onPaste, true)
		return () => document.removeEventListener('paste', onPaste, true)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open])

	if (disabled) return <>{children}</>

	const trigger = controlled
		? <RadixPopover.Anchor asChild>{children}</RadixPopover.Anchor>
		: <RadixPopover.Trigger asChild>{children}</RadixPopover.Trigger>

	return (
		<RadixPopover.Root open={open} onOpenChange={setOpen}>
			{trigger}
			{open ? (
				<RadixPopover.Portal container={container ?? undefined}>
					<RadixPopover.Content
						className="BlockIconPicker"
						role="dialog"
						aria-label="Block icon"
						side="bottom"
						align="start"
						sideOffset={6}
						collisionPadding={12}
						onPointerDown={(event) => event.stopPropagation()}
						onKeyDown={(event) => {
							if (event.key === 'Enter' && event.target === searchRef.current) {
								event.preventDefault()
								const first = tab === 'icons' ? filteredIcons[0] : tab === 'emoji' ? filteredEmoji[0] : null
								if (first) {
									if (tab === 'icons') choose({ kind: 'lucide', name: (first as LucideLibraryEntry).name })
									else choose({ kind: 'emoji', char: applySkinTone(first as EmojiEntry, tone) })
								}
							}
						}}
					>
						<div className="BlockIconPicker-head">
							{(['emoji', 'icons', 'upload'] as const).map((candidate) => (
								<button
									key={candidate}
									type="button"
									className="BlockIconPicker-tab"
									role="tab"
									aria-selected={tab === candidate}
									data-testid={`icon-picker-tab-${candidate}`}
									onClick={() => {
										setTab(candidate)
										setQuery('')
										setToneOpen(false)
									}}
								>
									{candidate === 'emoji' ? 'Emoji' : candidate === 'icons' ? 'Icons' : 'Upload'}
								</button>
							))}
							<button
								type="button"
								className="BlockIconPicker-remove"
								data-testid="icon-picker-remove"
								onClick={() => choose({ kind: 'none' })}
							>
								Remove
							</button>
						</div>

						{tab === 'upload' ? (
							<UploadPanel
								title={title}
								stage={upload}
								onPickFile={(file) => void stageFile(file)}
								onBack={() => setUpload({ kind: 'empty' })}
								onCancel={() => setOpen(false)}
								onSave={() => void saveUpload()}
								onToggleAddToLibrary={() =>
									setUpload((current) =>
										current.kind === 'preview' ? { ...current, addToLibrary: !current.addToLibrary } : current,
									)
								}
							/>
						) : (
							<>
								<div className="BlockIconPicker-filter">
									<label className="BlockIconPicker-search">
										<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
											<circle cx="11" cy="11" r="8" />
											<path d="m21 21-4.3-4.3" />
										</svg>
										<input
											ref={searchRef}
											type="text"
											placeholder="Filter…"
											autoComplete="off"
											spellCheck={false}
											value={query}
											data-testid="icon-picker-filter"
											onChange={(event) => setQuery(event.target.value)}
										/>
										{query ? (
											<button
												type="button"
												className="BlockIconPicker-clear"
												title="Clear"
												onClick={() => {
													setQuery('')
													searchRef.current?.focus()
												}}
											>
												<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
													<circle cx="12" cy="12" r="10" opacity=".5" fill="currentColor" />
													<path d="m9 9 6 6m0-6-6 6" stroke="var(--ss-surface-raised)" strokeWidth="2" strokeLinecap="round" />
												</svg>
											</button>
										) : null}
									</label>
									<button
										type="button"
										className="BlockIconPicker-btn"
										title="Random"
										data-testid="icon-picker-shuffle"
										onClick={() => {
											if (tab === 'icons') {
												const entry = randomEntry(filteredIcons)
												if (entry) choose({ kind: 'lucide', name: entry.name }, { keepOpen: true })
											} else {
												const entry = randomEntry(filteredEmoji)
												if (entry) choose({ kind: 'emoji', char: applySkinTone(entry, tone) }, { keepOpen: true })
											}
										}}
									>
										<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
											<path d="m18 14 4 4-4 4" /><path d="m18 2 4 4-4 4" />
											<path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22" />
											<path d="M2 6h1.972a4 4 0 0 1 3.6 2.2" /><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45" />
										</svg>
									</button>
									{tab === 'emoji' ? (
										<span className="BlockIconPicker-toneWrap">
											<button
												type="button"
												className="BlockIconPicker-btn"
												title="Skin tone"
												aria-haspopup="true"
												data-testid="icon-picker-tone"
												onClick={() => setToneOpen((current) => !current)}
											>
												{TONE_HANDS[tone]}
											</button>
											{toneOpen ? (
												<div className="BlockIconPicker-tonePop" role="menu">
													{TONE_HANDS.map((hand, index) => (
														<button
															key={hand}
															type="button"
															aria-pressed={tone === index}
															onClick={() => {
																setTone(index)
																writeSkinTone(index)
																setToneOpen(false)
															}}
														>
															{hand}
														</button>
													))}
												</div>
											) : null}
										</span>
									) : null}
								</div>

								<div className="BlockIconPicker-body">
									{!lucideLib || !emojiLib ? (
										<div className="BlockIconPicker-empty">Loading…</div>
									) : tab === 'icons' ? (
										<IconsGrid
											entries={filteredIcons}
											recent={recentIcons}
											query={query}
											value={value}
											onChoose={(name) => choose({ kind: 'lucide', name })}
										/>
									) : (
										<EmojiGrid
											entries={filteredEmoji}
											groups={emojiLib.groups}
											query={query}
											tone={tone}
											value={value}
											onChoose={(char) => choose({ kind: 'emoji', char })}
										/>
									)}
								</div>

								<div className="BlockIconPicker-foot">
									<span>
										{tab === 'icons'
											? lucideLib
												? `Lucide ${lucideLib.version} · ${lucideLib.entries.length} icons · ${filteredIcons.length} shown`
												: ''
											: emojiLib
												? `${emojiLib.entries.length} emoji · ${filteredEmoji.length} shown`
												: ''}
									</span>
								</div>
							</>
						)}
					</RadixPopover.Content>
				</RadixPopover.Portal>
			) : null}
		</RadixPopover.Root>
	)
}

function IconsGrid({
	entries,
	recent,
	query,
	value,
	onChoose,
}: {
	entries: readonly LucideLibraryEntry[]
	recent: readonly LucideLibraryEntry[]
	query: string
	value: BlockIconRef
	onChoose(name: string): void
}) {
	if (entries.length === 0) {
		return <div className="BlockIconPicker-empty">No icons match “{query}”.<br />Try the Emoji tab, or Upload your own.</div>
	}
	return (
		<>
			{recent.length > 0 ? (
				<>
					<div className="BlockIconPicker-section">Recent</div>
					<div className="BlockIconPicker-grid">
						{recent.map((entry) => (
							<IconCell key={`recent:${entry.name}`} entry={entry} selected={value.kind === 'lucide' && value.name === entry.name} onChoose={onChoose} />
						))}
					</div>
				</>
			) : null}
			<div className="BlockIconPicker-section">{query ? `Icons · ${entries.length}` : 'Icons'}</div>
			<div className="BlockIconPicker-grid">
				{entries.map((entry) => (
					<IconCell key={entry.name} entry={entry} selected={value.kind === 'lucide' && value.name === entry.name} onChoose={onChoose} />
				))}
			</div>
		</>
	)
}

function IconCell({
	entry,
	selected,
	onChoose,
}: {
	entry: LucideLibraryEntry
	selected: boolean
	onChoose(name: string): void
}) {
	const title = entry.tags.length ? `${entry.kebab} · ${entry.tags.slice(0, 4).join(', ')}` : entry.kebab
	return (
		<button
			type="button"
			className="BlockIconPicker-cell"
			aria-selected={selected}
			title={title}
			data-testid={`icon-picker-cell-lucide-${entry.name}`}
			onClick={() => onChoose(entry.name)}
		>
			<LucideNodeSvg node={entry.node} size={20} />
		</button>
	)
}

function EmojiGrid({
	entries,
	groups,
	query,
	tone,
	value,
	onChoose,
}: {
	entries: readonly EmojiEntry[]
	groups: readonly string[]
	query: string
	tone: number
	value: BlockIconRef
	onChoose(char: string): void
}) {
	if (entries.length === 0) {
		return <div className="BlockIconPicker-empty">No emoji match “{query}”.</div>
	}
	const cell = (entry: EmojiEntry) => {
		const char = applySkinTone(entry, tone)
		const title = entry.keywords.length ? `${entry.name} · ${entry.keywords.join(', ')}` : entry.name
		return (
			<button
				key={entry.slug}
				type="button"
				className="BlockIconPicker-cell BlockIconPicker-cell--emoji"
				aria-selected={value.kind === 'emoji' && value.char === char}
				title={title}
				data-testid={`icon-picker-cell-emoji-${entry.slug}`}
				onClick={() => onChoose(char)}
				style={{ fontFamily: EMOJI_FONT_FAMILY }}
			>
				{char}
			</button>
		)
	}
	if (query.trim()) {
		return (
			<>
				<div className="BlockIconPicker-section">Emoji · {entries.length}</div>
				<div className="BlockIconPicker-grid">{entries.map(cell)}</div>
			</>
		)
	}
	return (
		<>
			{groups.map((group) => {
				const items = entries.filter((entry) => entry.group === group)
				if (items.length === 0) return null
				return (
					<div key={group}>
						<div className="BlockIconPicker-section">{group}</div>
						<div className="BlockIconPicker-grid">{items.map(cell)}</div>
					</div>
				)
			})}
		</>
	)
}

function UploadPanel({
	title,
	stage,
	onPickFile,
	onBack,
	onCancel,
	onSave,
	onToggleAddToLibrary,
}: {
	title: string
	stage: UploadStage
	onPickFile(file: File): void
	onBack(): void
	onCancel(): void
	onSave(): void
	onToggleAddToLibrary(): void
}) {
	const fileInputRef = useRef<HTMLInputElement | null>(null)
	const dropTargetRef = useRef<HTMLButtonElement | null>(null)
	const [dragOver, setDragOver] = useState(false)

	if (stage.kind === 'preview' || stage.kind === 'saving') {
		const displayTitle = title || 'Block'
		return (
			<div className="BlockIconPicker-upload">
				<div className="BlockIconPicker-preview">
					<div className="BlockIconPicker-previewLabel">Preview</div>
					<div className="BlockIconPicker-previewRow">
						<div className="BlockIconPicker-previewChip BlockIconPicker-previewChip--big">
							<img src={stage.previewUrl} alt="" width={SIMPLE_ICON_PX} height={SIMPLE_ICON_PX} />
							<span>{displayTitle}</span>
						</div>
						<div className="BlockIconPicker-previewChip BlockIconPicker-previewChip--small">
							<img src={stage.previewUrl} alt="" width={HEADER_ICON_PX} height={HEADER_ICON_PX} />
							<span>{displayTitle}</span>
						</div>
					</div>
					<div className="BlockIconPicker-previewMeta">{describeUpload(stage.prepared)}</div>
				</div>
				<label className="BlockIconPicker-check">
					<input
						type="checkbox"
						checked={stage.kind === 'preview' && stage.addToLibrary}
						disabled
						onChange={onToggleAddToLibrary}
					/>
					Add to workspace library <span className="BlockIconPicker-checkNote">(phase 2)</span>
				</label>
				<div className="BlockIconPicker-actions">
					<button type="button" onClick={onBack} disabled={stage.kind === 'saving'}>Back</button>
					<button type="button" className="BlockIconPicker-save" onClick={onSave} disabled={stage.kind === 'saving'}>
						{stage.kind === 'saving' ? 'Saving…' : 'Save'}
					</button>
				</div>
			</div>
		)
	}

	return (
		<div className="BlockIconPicker-upload">
			<button
				ref={dropTargetRef}
				type="button"
				className={`BlockIconPicker-uploadButton${dragOver ? ' is-drop' : ''}`}
				data-testid="icon-picker-upload-button"
				onClick={() => fileInputRef.current?.click()}
				onDragOver={(event) => {
					event.preventDefault()
					setDragOver(true)
				}}
				onDragLeave={() => setDragOver(false)}
				onDrop={(event) => {
					event.preventDefault()
					setDragOver(false)
					const file = event.dataTransfer.files[0]
					if (file) onPickFile(file)
				}}
			>
				<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
					<rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
				</svg>
				Upload an image
			</button>
			<input
				ref={fileInputRef}
				type="file"
				accept="image/*,.svg"
				hidden
				data-testid="icon-picker-file-input"
				onChange={(event) => {
					const file = event.target.files?.[0]
					if (file) onPickFile(file)
					event.target.value = ''
				}}
			/>
			<div className="BlockIconPicker-uploadHint">or Ctrl+V to paste an image or link</div>
			{stage.kind === 'error' ? <div className="BlockIconPicker-uploadError">{stage.message}</div> : null}
			<div className="BlockIconPicker-actions">
				<button type="button" onClick={onCancel}>Cancel</button>
				<button type="button" className="BlockIconPicker-save" disabled>Save</button>
			</div>
		</div>
	)
}
