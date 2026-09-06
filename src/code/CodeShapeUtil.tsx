import {
	BaseBoxShapeUtil,
	Rectangle2d,
	createShapePropsMigrationIds,
	createShapePropsMigrationSequence,
	type RecordProps,
	type TLResizeInfo,
} from 'tldraw'
import { CodeBlockCanvas } from './CodeBlockCanvas'
import {
	CODE_GUTTER_WIDTH,
	CODE_LANGUAGE_LABELS,
	CODE_SHAPE_PROPS,
	CODE_SHAPE_TYPE,
	CODE_SIDE_PADDING,
	codeFontPixels,
	codePropsForPresentation,
	codePropsForResize,
	getDefaultCodeProps,
	upgradeCodePropsV0ToV1,
	type CodeShape,
} from './codeModel'

function CodeExportSvg({ shape }: { shape: CodeShape }) {
	const gutter = shape.props.showLineNumbers ? CODE_GUTTER_WIDTH : 0
	const fontSize = codeFontPixels(shape.props.size, shape.props.fontScale)
	const lines = shape.props.code.split('\n')
	return (
		<g pointerEvents="none">
			<rect x={0} y={0} width={shape.props.w} height={shape.props.h} rx={10} fill="#1e1e1e" stroke="#52525b" />
			{shape.props.showLineNumbers ? (
				<line x1={gutter + 6} y1={0} x2={gutter + 6} y2={shape.props.h} stroke="#3f3f46" />
			) : null}
			<text
				x={gutter + CODE_SIDE_PADDING}
				y={CODE_SIDE_PADDING + fontSize}
				fill="#e4e4e7"
				fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
				fontSize={fontSize}
			>
				{lines.map((line, index) => (
					<tspan key={`${index}:${line}`} x={gutter + CODE_SIDE_PADDING} dy={index === 0 ? 0 : fontSize * 1.45}>
						{line || ' '}
					</tspan>
				))}
			</text>
		</g>
	)
}

const codeVersions = createShapePropsMigrationIds(CODE_SHAPE_TYPE, {
	AddFontScale: 1,
})

/**
 * A canvas shape whose geometry is wholly tldraw-native; CodeMirror is only
 * the document surface inside it. This keeps moving, resizing and selection
 * on the engine seam rather than reimplementing a whiteboard primitive —
 * the babble record's hard gate g2 (docs/code-block-primitive-babble-*.json).
 */
export class CodeShapeUtil extends BaseBoxShapeUtil<CodeShape> {
	static override type = CODE_SHAPE_TYPE
	static override props: RecordProps<CodeShape> = CODE_SHAPE_PROPS
	static override migrations = createShapePropsMigrationSequence({
		sequence: [
			{
				id: codeVersions.AddFontScale,
				up: upgradeCodePropsV0ToV1,
				// Dropping the prop is the faithful downgrade: an older build
				// renders the rung size, which is the custom size's anchor.
				down: (props) => {
					delete (props as Record<string, unknown>).fontScale
				},
			},
		],
	})

	override getDefaultProps(): CodeShape['props'] {
		return getDefaultCodeProps()
	}

	override canResize(_shape: CodeShape): boolean {
		return true
	}

	override hideRotateHandle(_shape: CodeShape): boolean {
		return true
	}

	override getAriaDescriptor(shape: CodeShape): string {
		return `${CODE_LANGUAGE_LABELS[shape.props.language]} code, ${shape.props.characterWidth} characters wide${shape.props.showLineNumbers ? ', with line numbers' : ''}`
	}

	override getText(shape: CodeShape): string {
		return shape.props.code
	}

	override canEdit(_shape: CodeShape): boolean {
		return true
	}

	override getGeometry(shape: CodeShape) {
		return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })
	}

	override component(shape: CodeShape) {
		return <CodeBlockCanvas shape={shape} />
	}

	override toSvg(shape: CodeShape) {
		return <CodeExportSvg shape={shape} />
	}

	override getIndicatorPath(shape: CodeShape): Path2D {
		const path = new Path2D()
		path.roundRect(0, 0, shape.props.w, shape.props.h, 10)
		return path
	}

	/**
	 * The standard Font size menu (and any other style write) knows nothing
	 * about a Code block's character measure — this seam is what keeps a size
	 * change from silently narrowing the line measure: when the type scale or
	 * the gutter changes WITHOUT an accompanying width write, the pixel width
	 * is re-derived from the authored `ch` count. A resize writes `w` and
	 * `characterWidth` together, so it passes through untouched.
	 */
	override onBeforeUpdate(previous: CodeShape, next: CodeShape): CodeShape | void {
		const presentationChanged = previous.props.size !== next.props.size
			|| previous.props.fontScale !== next.props.fontScale
			|| previous.props.showLineNumbers !== next.props.showLineNumbers
		if (!presentationChanged || previous.props.w !== next.props.w) return
		return {
			...next,
			props: {
				...next.props,
				...codePropsForPresentation({ ...next.props, characterWidth: previous.props.characterWidth }, next.props),
			},
		}
	}

	override onResize(shape: CodeShape, info: TLResizeInfo<CodeShape>) {
		const resized = super.onResize(shape, info)
		const props = codePropsForResize(
			shape.props,
			resized.props?.w ?? shape.props.w,
			resized.props?.h ?? shape.props.h,
		)
		return { ...resized, props: { ...shape.props, ...props } }
	}
}
