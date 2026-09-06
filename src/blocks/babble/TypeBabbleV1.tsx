import { useState, type MouseEvent as ReactMouseEvent } from 'react'

import type { BlockShape } from '../blockModel'
import { caretOffsetFromPoint, lineStartOffset } from './caretGeometry'
import { SourceCodeEditor } from './SourceCodeEditor'
import { attributeLineSpans } from './sourceHighlight'
import { findTypeSlot } from './typeNameAutocompleteLogic'
import { AttributeSpans, regionStyle, type TypeResolution } from './TypeBabbleParts'
import { KNOWN_PRIMITIVES, parseFlatAttributes, type FlatAttribute } from './typeBabbleShared'
import { tokenizeTypeExpr, type TypeAlias } from './typeMappingShared'
import { requestSourceJump } from './typeSourceJump'
import { useTypeReferenceIndex, type ResolvedTypeRef } from './typeReferenceIndex'
import { useSourceToggleEditor } from './useSourceToggleEditor'

export type ChevronPlacement = 'trailing' | 'leading'
export type ChevronVisibility = 'always' | 'hover'
export type ChevronGlyph = 'triangle' | 'dot'
export type GuideStyle = 'rail' | 'dotted' | 'muted-rail'

function resolveName(index: ReadonlyMap<string, ResolvedTypeRef>, typeName: string): TypeResolution {
	const name = typeName.trim()
	if (KNOWN_PRIMITIVES.has(name)) return 'primitive'
	return index.has(name) ? 'known' : 'unknown'
}

/**
 * V1 — Segmented toggle, recursive expand.
 *
 * A small [UI | Source] switch owns the mode outright. Three separate click
 * targets share a row, matching how the block's own title already works
 * (select, THEN a click acts) rather than a double-click: the chevron
 * expands a known type's fields in place, to any depth, including a type
 * that references itself; the resolved type name itself is a link that
 * jumps the camera to its real definition; and a click anywhere else in an
 * already-selected block — the rest of the text, blank space in a row, even
 * the empty area below the last row — drops straight into Source mode with
 * the cursor at that point (a click in an EXPANDED, foreign row jumps to
 * whatever block owns it AND lands the cursor at that field's own line
 * there, since there is no source of its own to enter). A field whose type
 * is a Type Mapping alias (not a record) expands to show what the mapping
 * actually equals, one level, rather than pretending it has fields.
 *
 * Chevron styling: leading, always visible, muted-rail guide — Zach's pick
 * (2026-09-05) from a live side-by-side against the trailing/accent-rail
 * original, over prior-art guidance (VS Code's own faint indent-guide
 * default, disclosure-widget convention). See `TypeBabbleV1Variants.tsx`'s
 * `TypeBabbleV1PriorArt`, which shares this exact configuration.
 */
export function TypeBabbleV1(props: { shape: BlockShape; top: number; bottom: number; selected: boolean }) {
	return (
		<TypeBabbleV1Engine
			{...props}
			chevronPlacement="leading"
			chevronVisibility="always"
			guideStyle="muted-rail"
			testId="type-babble-v1"
		/>
	)
}

export function TypeBabbleV1Engine({
	shape,
	top,
	bottom,
	selected,
	chevronPlacement,
	chevronVisibility = 'always',
	chevronGlyph = 'triangle',
	guideStyle,
	testId,
}: {
	shape: BlockShape
	top: number
	bottom: number
	selected: boolean
	chevronPlacement: ChevronPlacement
	chevronVisibility?: ChevronVisibility
	chevronGlyph?: ChevronGlyph
	guideStyle: GuideStyle
	testId: string
}) {
	const { editor, source, mode, setMode, draft, setDraft, commit, cancel, enterSourceAt, sourceEditorRef, sourceCaret } =
		useSourceToggleEditor(shape, 'edit Type attributes (V1)')
	const attributes = parseFlatAttributes(source)
	const draftAttributes = parseFlatAttributes(draft)
	// Lifted above the UI/Source split (not owned by `AttributeTree`) because
	// that component unmounts every time Source mode replaces it — state
	// living there was resetting to all-collapsed on every round trip even
	// when nothing was edited. A stale path (the source changed enough that
	// it no longer names a real row) just quietly matches nothing; that is
	// an acceptable best effort, not a bug to chase further.
	const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(() => new Set())
	const togglePath = (path: string) => setExpandedPaths((current) => {
		const next = new Set(current)
		if (next.has(path)) next.delete(path)
		else next.add(path)
		return next
	})
	// One reactive scan of the board, shared by every row at every depth —
	// re-derives whenever any Type's title/fields or Mapping's aliases
	// change, so an edited default value reaches every open nested preview
	// in the same render instead of waiting for this block's own next
	// unrelated re-render.
	const typeIndex = useTypeReferenceIndex(editor)
	const resolve = (typeName: string): TypeResolution => resolveName(typeIndex, typeName)

	const jumpToDefinition = (block: BlockShape, offset?: number) => {
		editor.select(block.id)
		editor.zoomToSelection({ animation: { duration: 260 } })
		if (offset !== undefined) requestSourceJump(block.id, offset)
	}

	return (
		<section className="TypeBabble" data-testid={testId} data-selected={selected || undefined} style={regionStyle(top, bottom)}
			onPointerDown={(event) => { if (selected) event.stopPropagation() }}>
			<div className="TypeBabble-heading">
				<span>attributes</span>
				<div className="TypeBabbleV1-toggle" onPointerDown={(event) => event.stopPropagation()}>
					<button type="button" data-active={mode === 'ui' || undefined} onClick={() => setMode('ui')}>UI</button>
					<button type="button" data-active={mode === 'source' || undefined} onClick={() => setMode('source')}>Source</button>
				</div>
			</div>
			{mode === 'source' ? (
				<SourceCodeEditor
					value={draft}
					highlightLine={(raw, line) => {
						const attribute = draftAttributes.find((candidate) => candidate.line === line)
						return attribute ? attributeLineSpans(attribute, resolve) : null
					}}
					onChange={setDraft}
					onBlur={commit}
					onCancel={cancel}
					autoFocus
					testId={`${testId}-source`}
					handleRef={sourceEditorRef}
					initialCaret={sourceCaret}
					className="TypeBabble"
					// No `excludeBlockId`: this Type may legitimately reference
					// itself (Pose's own `x: Pose`), so its own name has to stay
					// a valid suggestion here too.
					completion={{ editor, findSlot: findTypeSlot }}
				/>
			) : (
				<AttributeTree
					attributes={attributes}
					owner={shape}
					rootId={shape.id}
					selected={selected}
					typeIndex={typeIndex}
					expandedPaths={expandedPaths}
					togglePath={togglePath}
					chevronPlacement={chevronPlacement}
					chevronVisibility={chevronVisibility}
					chevronGlyph={chevronGlyph}
					guideStyle={guideStyle}
					onEnterSource={enterSourceAt}
					onJumpToDefinition={jumpToDefinition}
				/>
			)}
		</section>
	)
}

function AttributeTree({
	attributes,
	owner,
	rootId,
	selected,
	typeIndex,
	expandedPaths,
	togglePath,
	chevronPlacement,
	chevronVisibility,
	chevronGlyph,
	guideStyle,
	onEnterSource,
	onJumpToDefinition,
}: {
	attributes: readonly FlatAttribute[]
	owner: BlockShape
	rootId: string
	selected: boolean
	typeIndex: ReadonlyMap<string, ResolvedTypeRef>
	expandedPaths: ReadonlySet<string>
	togglePath(path: string): void
	chevronPlacement: ChevronPlacement
	chevronVisibility: ChevronVisibility
	chevronGlyph: ChevronGlyph
	guideStyle: GuideStyle
	onEnterSource(offset: number): void
	onJumpToDefinition(block: BlockShape, offset?: number): void
}) {
	return (
		<div
			className="TypeBabbleV1-body"
			// A click that bubbles all the way up here (not caught by a row, a
			// chevron, or a link on the way) landed on genuinely empty space —
			// below the last row, or in a row's own unused width. There is no
			// more specific position to honour than "the end of my own source."
			onClick={(event) => { if (selected && event.target === event.currentTarget) onEnterSource(owner.props.attributeSource?.length ?? 0) }}
		>
			{attributes.map((attribute) => (
				<AttributeNode
					key={attribute.id}
					attribute={attribute}
					path={attribute.id}
					depth={0}
					owner={owner}
					rootId={rootId}
					selected={selected}
					typeIndex={typeIndex}
					expandedPaths={expandedPaths}
					togglePath={togglePath}
					chevronPlacement={chevronPlacement}
					chevronVisibility={chevronVisibility}
					chevronGlyph={chevronGlyph}
					guideStyle={guideStyle}
					onEnterSource={onEnterSource}
					onJumpToDefinition={onJumpToDefinition}
				/>
			))}
		</div>
	)
}

function AttributeNode({
	attribute,
	path,
	depth,
	owner,
	rootId,
	selected,
	typeIndex,
	expandedPaths,
	togglePath,
	chevronPlacement,
	chevronVisibility,
	chevronGlyph,
	guideStyle,
	onEnterSource,
	onJumpToDefinition,
}: {
	attribute: FlatAttribute
	path: string
	depth: number
	owner: BlockShape
	rootId: string
	selected: boolean
	typeIndex: ReadonlyMap<string, ResolvedTypeRef>
	expandedPaths: ReadonlySet<string>
	togglePath(path: string): void
	chevronPlacement: ChevronPlacement
	chevronVisibility: ChevronVisibility
	chevronGlyph: ChevronGlyph
	guideStyle: GuideStyle
	onEnterSource(offset: number): void
	onJumpToDefinition(block: BlockShape, offset?: number): void
}) {
	const resolve = (typeName: string): TypeResolution => resolveName(typeIndex, typeName)
	const typeName = attribute.type.trim()
	const resolved = typeName ? typeIndex.get(typeName) : undefined
	const known = Boolean(resolved)
	const isOpen = expandedPaths.has(path)
	const isOwnRow = owner.id === rootId

	// Three independent click destinies, carved out from one another with
	// `stopPropagation` on the more specific element so only one ever fires:
	// the chevron toggles (its own handler, below); the resolved type name is
	// a link that jumps to its real definition (`AttributeSpans`'
	// `onTypeActivate`, wired below); everything else in the row — the rest
	// of the text, the punctuation, blank space to either side — drops into
	// Source mode with the cursor at the click. A foreign/nested row isn't
	// this block's own source to edit, but it DOES belong to some real line
	// in `owner`'s source (the block that was expanded to produce it) — so it
	// jumps there and opens Source mode at that line, not merely at `resolved`
	// (that row's OWN forward reference, which is a different thing entirely,
	// and is simply absent for a leaf field like `y: float`, which is exactly
	// the "clicking it does nothing" bug this replaces). This holds at every
	// depth: `isOwnRow`, `owner`, and the offset are recomputed fresh for
	// each recursive level, not inherited from the row that expanded it.
	const activateRow = (event: ReactMouseEvent<HTMLElement>) => {
		if (!selected) return
		const withinRow = caretOffsetFromPoint(event.currentTarget, event.clientX, event.clientY)
		const column = Math.min(withinRow, attribute.raw.length)
		const offset = lineStartOffset(owner.props.attributeSource ?? '', attribute.line) + column
		if (!isOwnRow) {
			onJumpToDefinition(owner, offset)
			return
		}
		onEnterSource(offset)
	}

	const glyphClasses = ['TypeBabbleV1-chevronGlyph', `TypeBabbleV1-chevronGlyph--${chevronGlyph}`]
	if (known && chevronVisibility === 'hover') glyphClasses.push('TypeBabbleV1-chevronGlyph--hoverOnly')
	const glyphClass = glyphClasses.join(' ')
	const glyphContent = known && chevronGlyph === 'triangle' ? (isOpen ? '▾' : '▸') : null

	// Rendered on EVERY row, known or not — a row with nothing to expand
	// still reserves the same leading width, so "quality: float" (no
	// chevron) lines its text up with "pose: Pose" (has one) instead of
	// sitting flush left of it.
	const chevron = (
		<span
			aria-hidden={known ? undefined : true}
			className={glyphClass}
			data-caret-ignore=""
			data-open={isOpen || undefined}
			data-known={known || undefined}
			role={known ? 'button' : undefined}
			tabIndex={known ? 0 : undefined}
			onPointerDown={known ? (event) => event.stopPropagation() : undefined}
			onClick={known ? (event) => { event.stopPropagation(); togglePath(path) } : undefined}
		>{glyphContent}</span>
	)

	return (
		<div className="TypeBabbleV1-row" data-depth={depth}>
			<span
				className={`TypeBabbleV1-rowContent TypeBabbleV1-chevron--${chevronPlacement}`}
				onPointerDown={(event) => { if (selected) event.stopPropagation() }}
				onClick={activateRow}
			>
				{chevronPlacement === 'leading' ? chevron : null}
				<AttributeSpans
					attribute={attribute}
					resolve={resolve}
					onTypeActivate={resolved ? () => onJumpToDefinition(resolved.block) : undefined}
				/>
				{chevronPlacement === 'trailing' ? chevron : null}
			</span>
			{isOpen && resolved ? (
				<div className={`TypeBabbleV1-preview TypeBabbleV1-guide--${guideStyle}`} data-testid={depth === 0 ? 'type-babble-v1-preview' : undefined}>
					{resolved.kind === 'type' ? (
						parseFlatAttributes(resolved.block.props.attributeSource ?? '').map((field) => (
							<AttributeNode
								key={field.id}
								attribute={field}
								path={`${path}/${field.id}`}
								depth={depth + 1}
								owner={resolved.block}
								rootId={rootId}
								selected={selected}
								typeIndex={typeIndex}
								expandedPaths={expandedPaths}
								togglePath={togglePath}
								chevronPlacement={chevronPlacement}
								chevronVisibility={chevronVisibility}
								chevronGlyph={chevronGlyph}
								guideStyle={guideStyle}
								onEnterSource={onEnterSource}
								onJumpToDefinition={onJumpToDefinition}
							/>
						))
					) : (
						<MappingPreviewRow alias={resolved.alias} typeIndex={typeIndex} />
					)}
				</div>
			) : null}
		</div>
	)
}

/** What a Type Mapping alias equals, one level — a record field can name an
 * alias instead of another Type, and showing "what it does" (not a fake
 * field list) is what Zach asked to see when that happens. */
function MappingPreviewRow({ alias, typeIndex }: { alias: TypeAlias; typeIndex: ReadonlyMap<string, ResolvedTypeRef> }) {
	return (
		<div className="TypeBabbleV1-row">
			<span className="TypeBabble-name">{alias.name}</span>
			<span className="TypeBabble-punct"> = </span>
			{tokenizeTypeExpr(alias.expr).map((token, index) => (
				token.kind !== 'identifier' ? (
					<span key={index} className="TypeBabble-punct">{token.text}</span>
				) : (
					<span key={index} className={`TypeBabble-type TypeBabble-type--${resolveName(typeIndex, token.text)}`}>{token.text}</span>
				)
			))}
		</div>
	)
}
