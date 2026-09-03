import {
	BaseFrameLikeShapeUtil,
	createShapeId,
	type Editor,
	type TLShape,
} from 'tldraw'
import { describe, expect, it } from 'vitest'

import {
	BRANCH_ARM_SHAPE_TYPE,
	BranchArmShapeUtil,
	type BranchArmShape,
} from './BranchArmShapeUtil'
import {
	getDefaultBranchProps,
	setBranchArmOpenProps,
	type BranchShape,
} from './branchModel'

function branch(props = getDefaultBranchProps()): BranchShape {
	return {
		id: createShapeId('branch'),
		typeName: 'shape',
		type: 'branch',
		x: 0,
		y: 0,
		rotation: 0,
		index: 'a1' as BranchShape['index'],
		parentId: 'page:page' as BranchShape['parentId'],
		isLocked: false,
		opacity: 1,
		meta: {},
		props,
	}
}

function armFrame(parentId: BranchShape['id']): BranchArmShape {
	return {
		id: createShapeId('arm'),
		typeName: 'shape',
		type: BRANCH_ARM_SHAPE_TYPE,
		x: 0,
		y: 40,
		rotation: 0,
		index: 'a2' as BranchArmShape['index'],
		parentId,
		isLocked: false,
		opacity: 1,
		meta: { branchArm: 'arm_1' },
		props: { w: 420, h: 212, armId: 'arm_1' },
	}
}

function child(type: string): TLShape {
	return { type, meta: {}, props: {} } as TLShape
}

describe('Branch arm frame primitive', () => {
	it('is the stock frame-like primitive with one full-row rectangle', () => {
		const region = branch()
		const frame = armFrame(region.id)
		const util = new BranchArmShapeUtil({ getShape: () => region } as unknown as Editor)

		expect(BranchArmShapeUtil.prototype).toBeInstanceOf(BaseFrameLikeShapeUtil)
		expect(util.getGeometry(frame).bounds).toMatchObject({ x: 0, y: 0, w: 420, h: 212 })
	})

	it('clips ordinary children but leaves both semantic cables and stock arrows free', () => {
		const util = new BranchArmShapeUtil({} as Editor)
		expect(util.shouldClipChild(child('geo'))).toBe(true)
		expect(util.shouldClipChild(child('block'))).toBe(true)
		expect(util.shouldClipChild(child('connection'))).toBe(false)
		expect(util.shouldClipChild(child('arrow'))).toBe(false)
	})

	it('accepts drops only while its semantic arm is open', () => {
		let region = branch()
		const frame = armFrame(region.id)
		const util = new BranchArmShapeUtil({
			getShape: () => region,
		} as unknown as Editor)

		expect(util.canReceiveNewChildrenOfType(frame, 'block')).toBe(true)
		expect(util.canReceiveNewChildrenOfType(frame, 'connection')).toBe(false)
		region = branch(setBranchArmOpenProps(region.props, 'arm_1', false))
		expect(util.canReceiveNewChildrenOfType(frame, 'block')).toBe(false)
	})
})
