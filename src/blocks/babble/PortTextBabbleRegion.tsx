import type { BlockShape } from '../blockModel'
import { PortTextBabbleV1 } from './PortTextBabbleV1'
import { PortTextBabbleV2 } from './PortTextBabbleV2'
import { PortTextBabbleV3 } from './PortTextBabbleV3'
import { PortTextBabbleV4 } from './PortTextBabbleV4'
import './port-text-babble.css'

const VARIANTS = {
	1: PortTextBabbleV1,
	2: PortTextBabbleV2,
	3: PortTextBabbleV3,
	4: PortTextBabbleV4,
}

/**
 * Dev-only dispatch for the Port text-authoring babble: reached only when a
 * shape carries `meta.portTextBabbleVariant`, which no ordinary board ever
 * sets — see `BlockCanvas.tsx`'s one-line branch. Independent of the
 * Type/Type-Mapping attribute-body babbles (`meta.babbleVariant` /
 * `meta.typeMappingBabbleVariant`): this explores authoring a Block's OWN
 * `inputs`/`outputs`, not a Type's attribute list, and works on an ordinary
 * Block regardless of `blockType`.
 */
export function PortTextBabbleRegion({
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
	if (shape.props.view === 'simple') return null
	const variant = shape.meta?.portTextBabbleVariant
	const Variant = typeof variant === 'number' ? VARIANTS[variant as keyof typeof VARIANTS] : undefined
	if (!Variant) return null
	return <Variant shape={shape} top={top} bottom={bottom} selected={selected} />
}
