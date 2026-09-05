import { describe, expect, it } from 'vitest'

import { getFloatingPortConnectionPorts } from '../blocks/connections/blockPorts'
import {
	FLOATING_PORT_ID,
	getDefaultFloatingPortProps,
	type FloatingPortShape,
} from './floatingPortModel'
import { layoutFloatingPort } from './floatingPortLayout'

const shape = (props: Partial<FloatingPortShape['props']> = {}): FloatingPortShape => ({
	id: 'shape:free-port' as FloatingPortShape['id'],
	typeName: 'shape',
	type: 'floating-port',
	x: 320,
	y: 180,
	rotation: 0,
	index: 'a1' as FloatingPortShape['index'],
	parentId: 'page:page' as FloatingPortShape['parentId'],
	isLocked: false,
	opacity: 1,
	meta: {},
	props: { ...getDefaultFloatingPortProps(), ...props },
})

describe('floating Port primitive', () => {
	it('defaults to an auto-filled input with one stable cable socket', () => {
		const port = shape()
		expect(port.props).toMatchObject({
			name: 'port', type: 'Any', value: '', direction: 'input', textLayout: 'inline', fill: 'auto',
		})
		expect(getFloatingPortConnectionPorts(port)).toEqual([
			expect.objectContaining({ id: FLOATING_PORT_ID, side: 'input', x: 0, y: 0, hidden: false }),
		])
	})

	it('moves the whole label to the direction side and lifts it only when offset', () => {
		const output = layoutFloatingPort(shape({ direction: 'output', value: '3.5' }).props)
		const input = layoutFloatingPort(shape({ direction: 'input', textLayout: 'offset', value: '3.5' }).props)
		expect(output.label.x).toBeGreaterThan(0)
		expect(output.label.y).toBeLessThan(0)
		expect(input.label.x + input.label.w).toBeLessThan(0)
		expect(input.label.y).toBeLessThan(output.label.y)
		expect(input.labelText).toBe('port  Any = 3.5')
	})
})
