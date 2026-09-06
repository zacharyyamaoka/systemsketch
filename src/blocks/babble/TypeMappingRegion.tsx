import type { BlockShape } from '../blockModel'
import { TypeMappingV1 } from './TypeMappingV1'
import { TypeMappingV2 } from './TypeMappingV2'
import { TypeMappingV3 } from './TypeMappingV3'
import { TypeMappingV4 } from './TypeMappingV4'
import { TypeMappingV5 } from './TypeMappingV5'
import './type-mapping.css'

const VARIANTS = {
	1: TypeMappingV1,
	2: TypeMappingV2,
	3: TypeMappingV3,
	4: TypeMappingV4,
	5: TypeMappingV5,
}

/**
 * Dev-only dispatch for the Type MAPPING primitive babble ("algebraic type
 * system"): reached only when a shape carries `meta.typeMappingBabbleVariant`,
 * which no ordinary board ever sets. This is independent of `blockType` —
 * unlike Type, this exploration does not need a shipped primitive or tool to
 * be judged by feel, only a Block wearing this one dev marker. See the
 * one-line branch in `BlockCanvas.tsx`, which checks this meta BEFORE the
 * sibling attribute-body babble's own `meta.babbleVariant`.
 */
export function TypeMappingRegion({
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
	const variant = shape.meta?.typeMappingBabbleVariant
	const Variant = typeof variant === 'number' ? VARIANTS[variant as keyof typeof VARIANTS] : undefined
	if (!Variant) return null
	return <Variant shape={shape} top={top} bottom={bottom} selected={selected} />
}
