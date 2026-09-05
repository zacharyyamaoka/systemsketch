import {
	BaseBoxShapeUtil,
	Rectangle2d,
	createShapePropsMigrationSequence,
	type RecordProps,
	type TLResizeInfo,
} from 'tldraw'
import { CodeBlockCanvas } from './CodeBlockCanvas'
import {
	CODE_SHAPE_PROPS,
	CODE_SHAPE_TYPE,
	codePropsForResize,
	getDefaultCodeProps,
	type CodeShape,
} from './codeModel'

function CodeExportSvg({ shape }: { shape: CodeShape }) {
	const gutter = shape.props.showLineNumbers ? 42 : 0
	const lines = shape.props.code.split('\n')
	return (
		<g pointerEvents="none">
			<rect x={0} y={0} width={shape.props.w} height={shape.props.h} rx={8} fill="#1e1e1e" stroke="#52525b" />
		{shape.props.showLineNumbers ? (
			<line x1={gutter + 14} y1={0} x2={gutter + 14} y2={shape.props.h} stroke="#52525b" />
		) : null}
		<text x={14} y={20} fill="#ffffff" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize={shape.props.fontSize}>
			{lines.map((line, index) => (
				<tspan key={`${index}:${line}`} x={gutter + 14} dy={index === 0 ? 0 : shape.props.fontSize * 1.45}>
					{line || ' '}
				</tspan>
			))}
		</text>
		</g>
	)
}

/**
 * A canvas shape whose geometry is wholly tldraw-native; CodeMirror is only
 * the document surface inside it. This keeps moving, resizing and selection
 * on the engine seam rather than reimplementing a whiteboard primitive.
 */
export class CodeShapeUtil extends BaseBoxShapeUtil<CodeShape> {
	static override type = CODE_SHAPE_TYPE
	static override props: RecordProps<CodeShape> = CODE_SHAPE_PROPS
	static override migrations = createShapePropsMigrationSequence({ sequence: [] })

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
		return `${shape.props.language} code, ${shape.props.characterWidth} characters wide${shape.props.showLineNumbers ? ', with line numbers' : ''}`
	}

	override getText(shape: CodeShape): string {
		return shape.props.code
	}

	override canEdit(_shape: CodeShape): boolean {
		return true
	}

	override onDoubleClick(shape: CodeShape): void {
		this.editor.setEditingShape(shape.id)
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
		path.roundRect(0, 0, shape.props.w, shape.props.h, 8)
		return path
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
