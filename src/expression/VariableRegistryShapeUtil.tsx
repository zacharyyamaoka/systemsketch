import { BaseBoxShapeUtil, Rectangle2d, createShapePropsMigrationSequence, type RecordProps } from 'tldraw'
import {
	VARIABLE_REGISTRY_SHAPE_PROPS,
	VARIABLE_REGISTRY_SHAPE_TYPE,
	getDefaultVariableRegistryProps,
	type VariableRegistryShape,
} from './variableRegistryModel'

/**
 * A utility record wearing a shape's clothes so it persists with the board
 * exactly like every other custom prop bag here — never something a person
 * draws, resizes, or is meant to notice on canvas. It renders nothing.
 */
export class VariableRegistryShapeUtil extends BaseBoxShapeUtil<VariableRegistryShape> {
	static override type = VARIABLE_REGISTRY_SHAPE_TYPE
	static override props: RecordProps<VariableRegistryShape> = VARIABLE_REGISTRY_SHAPE_PROPS
	static override migrations = createShapePropsMigrationSequence({ sequence: [] })

	override getDefaultProps(): VariableRegistryShape['props'] {
		return getDefaultVariableRegistryProps()
	}

	override canResize(): boolean {
		return false
	}

	override hideResizeHandles(): boolean {
		return true
	}

	override hideRotateHandle(): boolean {
		return true
	}

	override canEdit(): boolean {
		return false
	}

	override getGeometry(shape: VariableRegistryShape) {
		return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })
	}

	override component(): null {
		return null
	}

	override toSvg(): null {
		return null
	}

	override getIndicatorPath(): undefined {
		return undefined
	}
}
