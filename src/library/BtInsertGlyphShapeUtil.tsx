/**
 * A static, non-interactive clone of the Behavior Tree region's "+" insert
 * affordance, for manual diagramming from the shape library.
 *
 * This shape carries no Behavior Tree state, is never created by BT layout
 * or projection code, and has no pointer handlers of its own — dropped from
 * the library it behaves like any other library shape (movable, deletable,
 * always visible), not a live insert-point wired into auto-layout. See
 * btInsertGlyphModel.ts for why this is its own shape type.
 */
import {
	HTMLContainer,
	Rectangle2d,
	ShapeUtil,
	createShapePropsMigrationSequence,
	type RecordProps,
} from 'tldraw'

import {
	BT_INSERT_GLYPH_SHAPE_PROPS,
	BT_INSERT_GLYPH_SHAPE_TYPE,
	getDefaultBtInsertGlyphProps,
	type BtInsertGlyphShape,
} from './btInsertGlyphModel'
import './bt-insert-glyph.css'

/** Exact glyph markup from BehaviorTreeCanvas.tsx's `InsertButton`. */
function InsertGlyphVisual({ shape }: { shape: BtInsertGlyphShape }) {
	const { w, h } = shape.props
	return (
		<HTMLContainer>
			<div
				className="systemsketch-library-bt-insert-glyph"
				style={{ width: w, height: h }}
				data-testid={`systemsketch-library-bt-insert-glyph-${shape.id}`}
			>
				<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
					<path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
				</svg>
			</div>
		</HTMLContainer>
	)
}

export class BtInsertGlyphShapeUtil extends ShapeUtil<BtInsertGlyphShape> {
	static override type = BT_INSERT_GLYPH_SHAPE_TYPE
	static override props: RecordProps<BtInsertGlyphShape> = BT_INSERT_GLYPH_SHAPE_PROPS
	static override migrations = createShapePropsMigrationSequence({ sequence: [] })

	override getDefaultProps(): BtInsertGlyphShape['props'] {
		return getDefaultBtInsertGlyphProps()
	}

	override canResize(_shape: BtInsertGlyphShape): boolean {
		return false
	}

	override hideResizeHandles(_shape: BtInsertGlyphShape): boolean {
		return true
	}

	override hideRotateHandle(_shape: BtInsertGlyphShape): boolean {
		return true
	}

	override canEdit(_shape: BtInsertGlyphShape): boolean {
		return false
	}

	override getAriaDescriptor(_shape: BtInsertGlyphShape): string {
		return 'Behavior Tree insert glyph'
	}

	override getGeometry(shape: BtInsertGlyphShape) {
		return new Rectangle2d({
			width: Math.max(1, shape.props.w),
			height: Math.max(1, shape.props.h),
			isFilled: true,
		})
	}

	override component(shape: BtInsertGlyphShape) {
		return <InsertGlyphVisual shape={shape} />
	}

	override getIndicatorPath(shape: BtInsertGlyphShape): Path2D {
		const path = new Path2D()
		path.roundRect(0, 0, shape.props.w, shape.props.h, 5)
		return path
	}

	/** Frozen snapshot paint for export/thumbnail contexts with no live CSS. */
	override toSvg(shape: BtInsertGlyphShape) {
		const { w, h } = shape.props
		return (
			<g>
				<rect x={0} y={0} width={w} height={h} rx={5} fill="#3b82f6" />
				<path
					d={`M${w / 2} ${h / 2 - 5}v10M${w / 2 - 5} ${h / 2}h10`}
					stroke="#ffffff"
					strokeWidth={2.2}
					strokeLinecap="round"
				/>
			</g>
		)
	}
}
