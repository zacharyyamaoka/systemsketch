/**
 * The control-node glyphs, drawn as strokes so they scale with the card.
 *
 * Sequence points the way the children read: across the page in a
 * top-to-bottom tree, down the page in a left-to-right one — Zach's rule
 * that the glyph shows the eye where to go next. Parallel points across
 * that reading direction instead, because its lanes fan out side by side
 * rather than running one after another: down the page in a top-to-bottom
 * tree, across the page in a left-to-right one.
 *
 * `sequence-reactive`/`fallback-reactive` draw the same base glyph as their
 * latched sibling plus a small corner loop — BT.CPP's Reactive* controls
 * re-check every child from the first on every tick instead of latching on
 * the running child, and that runtime fork needs to read at a glance without
 * opening the inspector (see `btGlyphFor` in `behaviorTreeModel.ts`).
 */
import type { BtGlyph, BtOrientation } from './behaviorTreeModel'

/** A small "re-checks every tick" loop, badged in the corner clear of every base glyph's strokes. */
const REACTIVE_BADGE = (
	<path
		key="reactive-badge"
		d="M22 5.5a3 3 0 1 1-1-2.3M22 2.7v2.8h-2.8"
		fill="none"
		stroke="currentColor"
		strokeWidth={1.5}
		strokeLinecap="round"
		strokeLinejoin="round"
	/>
)

export function BtGlyphSvg({ glyph, orientation, size = 24 }: { glyph: BtGlyph; orientation: BtOrientation; size?: number }) {
	const reactive = glyph === 'sequence-reactive' || glyph === 'fallback-reactive'
	const baseGlyph = glyph === 'sequence-reactive' ? 'sequence' : glyph === 'fallback-reactive' ? 'fallback' : glyph
	const childrenRun = orientation === 'down' ? 'right' : 'down'
	const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
	const arrow = (dx: number, dy: number, offset = 0) => (dx !== 0
		? <path key={offset} d={`M4 ${12 + offset} H20 M15 ${7 + offset} L20 ${12 + offset} L15 ${17 + offset}`} {...stroke} />
		: <path key={offset} d={`M${12 + offset} 4 V20 M${7 + offset} 15 L${12 + offset} 20 L${17 + offset} 15`} {...stroke} />)
	let body: React.ReactNode
	switch (baseGlyph) {
		case 'sequence':
			body = childrenRun === 'right' ? arrow(1, 0) : arrow(0, 1)
			break
		case 'parallel':
			// WHY: parallel lanes fan out side by side, so the glyph runs
			// perpendicular to childrenRun rather than parallel to it — the
			// opposite axis from sequence's reading-direction arrow.
			body = childrenRun === 'right'
				? [arrow(0, 1, -4.5), arrow(0, 1, 4.5)]
				: [arrow(1, 0, -4.5), arrow(1, 0, 4.5)]
			break
		case 'fallback':
			body = <path d="M8.5 9a3.5 3.5 0 1 1 5 3.2c-1.2.7-1.5 1.4-1.5 2.8M12 18.5v.1" {...stroke} />
			break
		case 'branch':
			body = <path d="M12 4v6M12 10l-6 5M12 10l6 5M6 15v5M18 15v5" {...stroke} />
			break
		case 'switch':
			body = <path d="M5 6h14M5 12h14M5 18h14M9 4v4M15 10v4M9 16v4" {...stroke} />
			break
		case 'inverter':
			body = <path d="M12 4.5v10M12 19.5v.1" {...stroke} strokeWidth={2.8} />
			break
		case 'retry':
			body = <path d="M18.5 12a6.5 6.5 0 1 1-2-4.7M18.5 4.5v3.3h-3.3" {...stroke} />
			break
		case 'repeat':
		case 'loop':
			body = <path d="M7 9h9a3 3 0 0 1 0 6H8M10 12l-3 3 3 3" {...stroke} />
			break
		case 'timeout':
			body = <><circle cx="12" cy="13" r="7" {...stroke} /><path d="M12 9v4l3 2M9.5 3.5h5" {...stroke} /></>
			break
		case 'delay':
			body = <path d="M7 4h10M7 20h10M8 4c0 5 8 5 8 8s-8 3-8 8M16 4c0 5-8 5-8 8s8 3 8 8" {...stroke} />
			break
		case 'force-success':
			body = <path d="M5 12.5l4.5 4.5L19 7.5" {...stroke} strokeWidth={2.6} />
			break
		case 'force-failure':
			body = <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" {...stroke} strokeWidth={2.6} />
			break
		case 'run-once':
			body = <path d="M9.5 8.5L12.5 6v12" {...stroke} strokeWidth={2.6} />
			break
		case 'keep-running':
			body = <path d="M7 12c0-2 1.3-3.2 2.8-3.2 2.6 0 3.8 6.4 6.4 6.4 1.5 0 2.8-1.2 2.8-3.2s-1.3-3.2-2.8-3.2c-2.6 0-3.8 6.4-6.4 6.4C8.3 15.2 7 14 7 12z" {...stroke} />
			break
		case 'precondition':
			body = <path d="M6 7h4M8 7v10M13 7h5M13 12h4M13 17h5" {...stroke} />
			break
		default:
			body = <rect x="5" y="5" width="14" height="14" rx="2.5" {...stroke} />
	}
	return (
		<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
			{body}
			{reactive ? REACTIVE_BADGE : null}
		</svg>
	)
}
