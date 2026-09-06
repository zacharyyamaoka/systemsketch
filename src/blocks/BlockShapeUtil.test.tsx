import { renderToStaticMarkup } from 'react-dom/server'
import { type Editor, createShapeId } from 'tldraw'
import { describe, expect, it } from 'vitest'

import { BlockShapeUtil } from './BlockShapeUtil'
import {
	BLOCK_SHAPE_TYPE,
	getDefaultBlockProps,
	resizeBlockProps,
	setBlockViewProps,
	type BlockShape,
} from './blockModel'

function expandedBlock(insetBackground: BlockShape['props']['insetBackground']): BlockShape {
	const expanded = setBlockViewProps(getDefaultBlockProps(), 'expanded')
	return {
		id: createShapeId(`inset-${insetBackground}`),
		typeName: 'shape',
		type: BLOCK_SHAPE_TYPE,
		x: 0,
		y: 0,
		rotation: 0,
		index: 'a1' as BlockShape['index'],
		parentId: 'page:page' as BlockShape['parentId'],
		isLocked: false,
		opacity: 1,
		meta: {},
		props: { ...resizeBlockProps(expanded, 600, 760), insetBackground },
	}
}

describe('Block SVG export', () => {
	it('paints the soft-gray inset body without tinting the base surface', () => {
		const util = new BlockShapeUtil(null as unknown as Editor)
		const gray = renderToStaticMarkup(util.toSvg(expandedBlock('soft-gray')))
		const white = renderToStaticMarkup(util.toSvg(expandedBlock('white')))

		expect(gray).toContain('fill="#f4f4f5"')
		expect(gray).toContain('fill="#ffffff"')
		expect(white).not.toContain('fill="#f4f4f5"')
	})
})
