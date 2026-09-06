/**
 * The composition root: every shape kind that knows how to reduce itself to
 * stock tldraw primitives, in one flat list.
 *
 * This is deliberately the only place in the codebase that enumerates the
 * detachable kinds. Registering a new one is one import line here plus a
 * `DetachableKind` definition beside the shape's own module — the sweep, the
 * discovery walk, the export, and every composite pick it up from this list;
 * none of them is edited.
 */
import type { DetachableKind } from './detachableKind'
import { connectionDetachable } from '../blocks/connections/connectionDetachable'
import { blockDetachable } from '../blocks/detach/blockDetachable'
import { codeDetachable } from '../code/codeDetachable'
import { branchDetachable } from '../branch/branchDetachable'
import { loopDetachable } from '../loop/loopDetachable'
import { behaviorTreeDetachable } from '../behaviorTree/behaviorTreeDetachable'
import { floatingPortDetachable } from '../floatingPort/floatingPortDetachable'

export const DETACHABLE_KINDS: readonly DetachableKind[] = [
	connectionDetachable,
	blockDetachable,
	codeDetachable,
	branchDetachable,
	loopDetachable,
	behaviorTreeDetachable,
	floatingPortDetachable,
]
