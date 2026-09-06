import type { BlockShape } from '../blockModel'
import { isTypeBlock } from '../typeAttributes'
import { TypeBabbleV1 } from './TypeBabbleV1'
import {
	TypeBabbleV1AltA,
	TypeBabbleV1AltB,
	TypeBabbleV1DotToggle,
	TypeBabbleV1HoverReveal,
	TypeBabbleV1PriorArt,
} from './TypeBabbleV1Variants'
import { TypeBabbleV2 } from './TypeBabbleV2'
import { TypeBabbleV3 } from './TypeBabbleV3'
import { TypeBabbleV4 } from './TypeBabbleV4'
import { TypeBabbleV5 } from './TypeBabbleV5'
import './type-babble.css'

const VARIANTS = {
	1: TypeBabbleV1,
	2: TypeBabbleV2,
	3: TypeBabbleV3,
	4: TypeBabbleV4,
	5: TypeBabbleV5,
	6: TypeBabbleV1AltA,
	7: TypeBabbleV1AltB,
	8: TypeBabbleV1PriorArt,
	9: TypeBabbleV1HoverReveal,
	10: TypeBabbleV1DotToggle,
}

/**
 * Dev-only dispatch for the attribute-body babble: reached only when a shape
 * carries `meta.babbleVariant`, which no ordinary board ever sets. Every
 * other Type Block renders through the shipped `TypeAttributeRegion`
 * unchanged — see the one-line branch in `BlockCanvas.tsx`.
 */
export function TypeBabbleRegion({
	shape,
	top,
	bottom,
	selected,
}: {
	shape: BlockShape
	top: number
	bottom: number
	selected: boolean
}) {
	if (!isTypeBlock(shape.props) || shape.props.view === 'simple') return null
	const variant = shape.meta?.babbleVariant
	const Variant = typeof variant === 'number' ? VARIANTS[variant as keyof typeof VARIANTS] : undefined
	if (!Variant) return null
	return <Variant shape={shape} top={top} bottom={bottom} selected={selected} />
}
