/**
 * A control or decorator occurrence on the canvas: a small card that is only
 * ever created by the Behavior Tree region's projection.
 *
 * Two faces, per Zach's wireframes: `expanded` is glyph plus label in a
 * bordered card (`→ Sequence`); `compact` is the same glyph alone in a
 * square, for people who already know the vocabulary. It carries no ports —
 * a control's parameters (thresholds, attempts) are edited in the inspector
 * — so it stays a plain selectable box the region's wires meet at its edges.
 */
import {
	HTMLContainer,
	Rectangle2d,
	ShapeUtil,
	createShapePropsMigrationSequence,
	type RecordProps,
	type TLShape,
} from 'tldraw'

import {
	BT_CONTROL_COMPACT,
	BT_CONTROL_EXPANDED_H,
	BT_CONTROL_EXPANDED_MIN_W,
	BT_CONTROL_SHAPE_TYPE,
	BT_GLYPHS,
	BT_ORIENTATIONS,
	BT_CONTROL_FACES,
	getDefaultBtControlProps,
	type BtControlShape,
} from './behaviorTreeModel'
import { BtGlyphSvg } from './btGlyphs'
import { T } from 'tldraw'
import './bt-control.css'

export const BT_CONTROL_SHAPE_PROPS = {
	w: T.number,
	h: T.number,
	label: T.string,
	glyph: T.literalEnum(...BT_GLYPHS),
	face: T.literalEnum(...BT_CONTROL_FACES),
	tone: T.literalEnum('control', 'decorator', 'unknown'),
	orientation: T.literalEnum(...BT_ORIENTATIONS),
} as const

function ControlCard({ shape }: { shape: BtControlShape }) {
	const { w, h, label, glyph, face, tone, orientation } = shape.props
	return (
		<HTMLContainer>
			<div
				className="systemsketch-bt-control"
				data-face={face}
				data-tone={tone}
				data-glyph={glyph}
				data-testid={`bt-control-${shape.id}`}
				style={{ width: w, height: h }}
				title={label}
			>
				<span className="BtControl-glyph"><BtGlyphSvg glyph={glyph} orientation={orientation} size={face === 'compact' ? 30 : 26} /></span>
				{face === 'expanded' ? <span className="BtControl-label">{label}</span> : null}
			</div>
		</HTMLContainer>
	)
}

export class BtControlShapeUtil extends ShapeUtil<BtControlShape> {
	static override type = BT_CONTROL_SHAPE_TYPE
	static override props: RecordProps<BtControlShape> = BT_CONTROL_SHAPE_PROPS
	static override migrations = createShapePropsMigrationSequence({ sequence: [] })

	override getDefaultProps(): BtControlShape['props'] {
		return getDefaultBtControlProps()
	}

	override canResize(_shape: BtControlShape): boolean {
		return false
	}

	override hideResizeHandles(_shape: BtControlShape): boolean {
		return true
	}

	override hideRotateHandle(_shape: BtControlShape): boolean {
		return true
	}

	override canEdit(_shape: BtControlShape): boolean {
		return false
	}

	override getAriaDescriptor(shape: BtControlShape): string {
		return `${shape.props.label}, ${shape.props.tone} node`
	}

	override getText(shape: BtControlShape): string {
		return shape.props.label
	}

	override getGeometry(shape: BtControlShape) {
		return new Rectangle2d({ width: Math.max(1, shape.props.w), height: Math.max(1, shape.props.h), isFilled: true })
	}

	override component(shape: BtControlShape) {
		return <ControlCard shape={shape} />
	}

	override getIndicatorPath(shape: BtControlShape): Path2D {
		const path = new Path2D()
		path.roundRect(0, 0, shape.props.w, shape.props.h, shape.props.face === 'compact' ? 10 : 8)
		return path
	}

	override toSvg(shape: BtControlShape) {
		const { w, h, label, face } = shape.props
		return (
			<g>
				<rect x={0.8} y={0.8} width={Math.max(0, w - 1.6)} height={Math.max(0, h - 1.6)} rx={face === 'compact' ? 10 : 8} fill="#ffffff" stroke="#27272a" strokeWidth={1.6} />
				{face === 'expanded' ? (
					<text x={w / 2 + 12} y={h / 2} textAnchor="middle" dominantBaseline="middle" fontFamily="Inter, ui-sans-serif, system-ui" fontSize={20} fontWeight={600} fill="#27272a">{label}</text>
				) : null}
			</g>
		)
	}
}

export function controlShapeSize(face: 'expanded' | 'compact', label: string): { w: number; h: number } {
	if (face === 'compact') return { w: BT_CONTROL_COMPACT, h: BT_CONTROL_COMPACT }
	return { w: Math.max(BT_CONTROL_EXPANDED_MIN_W, 64 + label.length * 13), h: BT_CONTROL_EXPANDED_H }
}

export function isBtControlShapeRecord(shape: TLShape | null | undefined): shape is BtControlShape {
	return shape?.type === BT_CONTROL_SHAPE_TYPE
}
