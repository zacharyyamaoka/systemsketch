/**
 * The edge model: a shape's own outline colour, its thickness, and the async
 * cadence.
 *
 * Both live in metadata rather than in a style prop, so these tests pin the
 * two things that buys — a shape with no override is byte-identical to one
 * that never had one, and a stock `.tldr` reader still sees a legal dash — as
 * well as the reading rules the menu depends on.
 */
import { describe, expect, it } from 'vitest'
import { DefaultDashStyle, type Editor, type StyleProp, type TLShape } from 'tldraw'

import {
	ASYNC_LINE_VALUE,
	SYSTEMSKETCH_STROKE_META_KEY,
	STROKE_WIDTH_PX,
	applyLinePattern,
	applyStrokeMeta,
	applyStrokeWidth,
	hasAdjustableStrokeWidth,
	hasPaintedEdge,
	installStrokeWidthDefault,
	isAsyncStroke,
	linePatternOf,
	nextStrokeWidth,
	pinStrokeWidth,
	readStrokeMeta,
	resolveStrokeHex,
	seedDefaultLineStyle,
	sharedEdgeValue,
	strokeColorOf,
	strokeWidthDisplayValue,
	strokeWidthOf,
	writeStrokeMeta,
} from './strokeMeta'

interface FakeShape {
	id: string
	type: string
	meta: Record<string, unknown>
	props: Record<string, unknown>
}

const geo = (
	id: string,
	props: Record<string, unknown> = {},
	meta: Record<string, unknown> = {},
): FakeShape => ({
	id: `shape:${id}`,
	type: 'geo',
	meta,
	props: { color: 'blue', dash: 'solid', ...props },
})

/** A shape with no outline at all: no `dash`, so no edge to colour. */
const text = (id: string, color = 'blue'): FakeShape => ({
	id: `shape:${id}`,
	type: 'text',
	meta: {},
	props: { color },
})

/**
 * The three editor calls the edge writes make. Small on purpose: the real
 * fold-and-write semantics are tldraw's, and the browser journey is what
 * proves them on a live canvas.
 */
function fakeEditor(shapes: FakeShape[], stored?: string) {
	const marks: string[] = []
	const styleWrites: Array<{ scope: 'selected' | 'next'; value: unknown }> = []
	let instanceMeta: Record<string, unknown> = {}
	const editor = {
		getSelectedShapes: () => shapes as unknown as TLShape[],
		getInstanceState: () => ({
			stylesForNextShape: stored === undefined ? {} : { [DefaultDashStyle.id]: stored },
			meta: instanceMeta,
		}),
		updateInstanceState: (next: { meta?: Record<string, unknown> }) => {
			if (next.meta) instanceMeta = next.meta
		},
		getInitialMetaForShape: () => ({}),
		isIn: (state: string) => state === 'select',
		markHistoryStoppingPoint: (label: string) => marks.push(label),
		run: (fn: () => void) => fn(),
		setStyleForSelectedShapes: (_style: StyleProp<string>, value: string) => {
			styleWrites.push({ scope: 'selected', value })
			for (const shape of shapes) shape.props.dash = value
		},
		setStyleForNextShapes: (_style: StyleProp<string>, value: string) => {
			styleWrites.push({ scope: 'next', value })
		},
		updateShapes: (partials: Array<{ id: string; meta: Record<string, unknown> }>) => {
			for (const partial of partials) {
				const shape = shapes.find((candidate) => candidate.id === partial.id)
				if (shape) shape.meta = partial.meta
			}
		},
	} as unknown as Editor
	return { editor, marks, styleWrites }
}

describe('edge metadata', () => {
	it('drops the key entirely once the last override is cleared', () => {
		// A shape that has been round-tripped through the menu and back must be
		// indistinguishable from one that was never touched, or every board
		// grows a layer of empty records.
		const shape = geo('a')
		const withColor = writeStrokeMeta(shape, 'color', 'black')
		expect(withColor[SYSTEMSKETCH_STROKE_META_KEY]).toEqual({ color: 'black' })

		const cleared = writeStrokeMeta({ ...shape, meta: withColor }, 'color', undefined)
		expect(cleared).toEqual({})
		expect(SYSTEMSKETCH_STROKE_META_KEY in cleared).toBe(false)
	})

	it('leaves every other metadata key alone', () => {
		const shape = geo('a', {}, { excalidrawRoundness: { type: 3 } })
		const next = writeStrokeMeta(shape, 'pattern', ASYNC_LINE_VALUE)
		expect(next.excalidrawRoundness).toEqual({ type: 3 })
		expect(next[SYSTEMSKETCH_STROKE_META_KEY]).toEqual({ pattern: 'async' })
	})

	it('ignores a record that is not one of ours', () => {
		expect(readStrokeMeta(geo('a', {}, { systemSketchStroke: 'black' }))).toEqual({})
		expect(readStrokeMeta(geo('a', {}, { systemSketchStroke: { color: 3, pattern: 'wobbly' } })))
			.toEqual({})
	})

	it('falls back to the colour tldraw already paints the outline with', () => {
		// WHY the fallback is `color` rather than nothing: the palette must show
		// a ringed swatch on a shape that has never been given an edge colour,
		// because that shape does have a visible edge colour.
		expect(strokeColorOf(geo('a'))).toBe('blue')
		expect(strokeColorOf(geo('a', {}, { systemSketchStroke: { color: 'black' } }))).toBe('black')
	})

	it('reads async over the dash the shape actually stores', () => {
		const shape = geo('a', { dash: 'solid' }, { systemSketchStroke: { pattern: 'async' } })
		expect(linePatternOf(shape)).toBe('async')
		expect(isAsyncStroke(shape)).toBe(true)
		// The stored dash stays a legal tldraw value, which is what lets a plain
		// tldraw reader open the shape and draw a solid outline.
		expect(shape.props.dash).toBe('solid')
	})

	it('only counts shapes that have an outline at all', () => {
		expect(hasPaintedEdge(geo('a'))).toBe(true)
		expect(hasPaintedEdge(text('t'))).toBe(false)
	})

	it('reports one value, or mixed, the way a shared style map does', () => {
		expect(sharedEdgeValue([geo('a'), geo('b')], strokeColorOf))
			.toEqual({ type: 'shared', value: 'blue' })
		expect(sharedEdgeValue([geo('a'), geo('b', { color: 'red' })], strokeColorOf))
			.toEqual({ type: 'mixed' })
		expect(sharedEdgeValue([], strokeColorOf)).toBeUndefined()
		// A text object in the selection has no edge and must not make the
		// rectangle beside it read as mixed.
		expect(sharedEdgeValue([geo('a'), text('t', 'red')], strokeColorOf))
			.toEqual({ type: 'shared', value: 'blue' })
	})

	it('resolves a palette name through the live theme, and nothing else', () => {
		const theme = { colors: { light: { blue: { solid: '#4465e9' } }, dark: {} } } as never
		expect(resolveStrokeHex(theme, 'light', 'blue')).toBe('#4465e9')
		expect(resolveStrokeHex(theme, 'light', undefined)).toBeUndefined()
		expect(resolveStrokeHex(theme, 'dark', 'blue')).toBeUndefined()
	})
})

describe('applying an edge', () => {
	it('writes the colour to every shape in one history step', () => {
		const shapes = [geo('a'), geo('b')]
		const { editor, marks } = fakeEditor(shapes)
		applyStrokeMeta(editor, 'color', 'black')
		expect(marks).toEqual(['appearance'])
		expect(shapes.map((shape) => readStrokeMeta(shape).color)).toEqual(['black', 'black'])
	})

	it('lands async as a solid dash plus the override, and clears it again', () => {
		const shapes = [geo('a', { dash: 'dashed' })]
		const { editor, styleWrites } = fakeEditor(shapes)

		applyLinePattern(editor, ASYNC_LINE_VALUE)
		expect(shapes[0].props.dash).toBe('solid')
		expect(isAsyncStroke(shapes[0])).toBe(true)

		// Choosing a stock style must clear the override rather than leave it
		// winning invisibly over the dash the user just picked.
		applyLinePattern(editor, 'dotted')
		expect(shapes[0].props.dash).toBe('dotted')
		expect(isAsyncStroke(shapes[0])).toBe(false)
		expect(shapes[0].meta).toEqual({})
		expect(styleWrites.map((write) => write.value)).toEqual(['solid', 'solid', 'dotted', 'dotted'])
	})
})

describe('the dash a fresh shape is drawn with', () => {
	it('seeds solid — a house style now, not a menu-vocabulary gap', () => {
		const { editor, styleWrites } = fakeEditor([])
		seedDefaultLineStyle(editor)
		expect(styleWrites).toEqual([{ scope: 'next', value: 'solid' }])
	})

	it('leaves a choice already made on the canvas alone', () => {
		const { editor, styleWrites } = fakeEditor([], 'dashed')
		seedDefaultLineStyle(editor)
		expect(styleWrites).toEqual([])
	})
})

describe('edge thickness', () => {
	it('reads the rung a shape is painted at, override or stock size', () => {
		// The whole complaint: `size` drove BOTH the label's font and the
		// outline, so picking Extra large for a title thickened the rectangle.
		// Un-overridden shapes still read truthfully off that rung...
		expect(strokeWidthOf(geo('a', { size: 's' }))).toBe('thin')
		expect(strokeWidthOf(geo('b', { size: 'm' }))).toBe('medium')
		// ...and `l`/`xl` are off the three-rung ladder, so they report the
		// number actually painted rather than claiming a rung they are not on.
		expect(strokeWidthOf(geo('c', { size: 'l' }))).toBe('5')
		expect(strokeWidthOf(geo('d', { size: 'xl' }))).toBe('10')
		// An override wins over the rung outright — that is the decoupling.
		const overridden = geo('e', { size: 'xl' }, {
			[SYSTEMSKETCH_STROKE_META_KEY]: { width: STROKE_WIDTH_PX.thin },
		})
		expect(strokeWidthOf(overridden)).toBe('thin')
	})

	it('reports nothing for a shape whose painter would ignore the override', () => {
		// A Block cable paints its own semantic width; offering a row that
		// silently did nothing is exactly the lie the null reading prevents.
		const cable = { ...geo('a'), type: 'connection' }
		expect(hasAdjustableStrokeWidth(cable)).toBe(false)
		expect(strokeWidthOf(cable)).toBeUndefined()
		// A text shape has no outline at all.
		expect(strokeWidthOf(text('t'))).toBeUndefined()
		// Geo, draw, line and arrow all name `strokeWidth` the same way.
		for (const type of ['geo', 'draw', 'line', 'arrow']) {
			expect(hasAdjustableStrokeWidth({ ...geo('a'), type })).toBe(true)
		}
	})

	it('hands the paint seam a width the shape\'s own scale cannot move', () => {
		// tldraw multiplies the display value by `scale`, and this app moves
		// `scale` to hit an exact font size (`customFontSize.ts`). Dividing here
		// is what makes a chosen thickness survive a text-size change.
		const scaled = geo('a', { scale: 2 }, {
			[SYSTEMSKETCH_STROKE_META_KEY]: { width: 5 },
		})
		expect(strokeWidthDisplayValue(scaled)).toBe(2.5)
		// No override: tldraw's own size-derived width is left completely alone.
		expect(strokeWidthDisplayValue(geo('b', { size: 'xl' }))).toBeUndefined()
		// ...but the READING is what is on screen, scale included.
		expect(strokeWidthOf(geo('c', { size: 'm', scale: 3 }))).toBe('10.5')
	})

	it('writes one rung across the selection and remembers it for the next shape', () => {
		const shapes = [geo('a'), geo('b')]
		const { editor, marks } = fakeEditor(shapes)
		applyStrokeWidth(editor, 'thick')
		expect(marks).toEqual(['appearance'])
		for (const shape of shapes) {
			expect(readStrokeMeta(shape).width).toBe(STROKE_WIDTH_PX.thick)
		}
		expect(nextStrokeWidth(editor)).toBe(STROKE_WIDTH_PX.thick)

		// A value that is not a rung is refused rather than stored raw.
		applyStrokeWidth(editor, 'enormous')
		expect(readStrokeMeta(shapes[0]).width).toBe(STROKE_WIDTH_PX.thick)
	})

	it('gives a fresh shape the remembered thickness and a copy its own', () => {
		const { editor } = fakeEditor([geo('a')])
		applyStrokeWidth(editor, 'thin')
		const stop = installStrokeWidthDefault(editor)
		const seeded = editor.getInitialMetaForShape(
			{ type: 'geo', props: { dash: 'solid' } } as never,
		)
		expect(seeded[SYSTEMSKETCH_STROKE_META_KEY]).toEqual({ width: STROKE_WIDTH_PX.thin })
		// A shape whose util cannot paint it is left completely alone.
		expect(editor.getInitialMetaForShape(
			{ type: 'connection', props: { dash: 'solid' } } as never,
		)).toEqual({})
		stop()
		expect(editor.getInitialMetaForShape(
			{ type: 'geo', props: { dash: 'solid' } } as never,
		)).toEqual({})
	})
})

describe('changing the text size no longer changes the outline', () => {
	it('pins the painted thickness before something else can move it', () => {
		// The reported bug in one assertion: `size` drove BOTH the label font
		// and the stroke, so picking Extra large for a title thickened the
		// rectangle from 3.5px to 10px.
		const shapes = [geo('a', { size: 'm' }), geo('b', { size: 'm' })]
		const { editor } = fakeEditor(shapes)
		pinStrokeWidth(editor)
		for (const shape of shapes) expect(readStrokeMeta(shape).width).toBe(3.5)
		// The shape now paints 3.5 whatever its rung becomes.
		shapes[0].props.size = 'xl'
		expect(strokeWidthDisplayValue(shapes[0])).toBe(3.5)
	})

	it('leaves a thickness someone already chose alone', () => {
		const chosen = geo('a', { size: 'm' }, {
			[SYSTEMSKETCH_STROKE_META_KEY]: { width: STROKE_WIDTH_PX.thick },
		})
		const { editor } = fakeEditor([chosen])
		pinStrokeWidth(editor)
		expect(readStrokeMeta(chosen).width).toBe(STROKE_WIDTH_PX.thick)
	})

	it('never stamps a shape whose painter would ignore the stamp', () => {
		const cable = { ...geo('a'), type: 'connection' }
		const { editor } = fakeEditor([cable, text('t') as never])
		pinStrokeWidth(editor)
		expect(cable.meta).toEqual({})
	})
})
