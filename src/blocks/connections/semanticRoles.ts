/**
 * Live semantic-role projection for ports and cables.
 *
 * WHY: the wire is a reading of its endpoints, not a second editable fact.
 * Storing a role on both would let a renamed/re-linked port silently drift from
 * its cable.  The whiteboard can still connect disagreeing ports; the reader
 * gets an honest warning instead of a veto or a hidden rewrite.
 */
import type { Editor, TLShapeId } from 'tldraw'

import {
	SEMANTIC_PORT_ROLES,
	isBlockShape,
	type BlockPort,
	type SemanticPortRole,
	type SemanticPortRoleClaim,
} from '../blockModel'
import { isBranchShape } from '../../branch/branchModel'
import { isLoopShape } from '../../loop/loopModel'
import { getPortHostPort, isPortHostShape, type PortHostShape } from './blockPorts'
import { getConnectionBindings, getConnectionDirection } from './ConnectionBindingUtil'
import type { ConnectionBinding } from './ConnectionBindingUtil'
import type { ConnectionShape } from './ConnectionShapeUtil'

export { SEMANTIC_PORT_ROLES }
export type { SemanticPortRole }

export type SemanticRoleOrigin = 'authored' | 'derived' | 'implicit'

export interface ResolvedSemanticRole {
	role: SemanticPortRole
	origin: SemanticRoleOrigin
	claim: SemanticPortRoleClaim | null
}

export const IMPLICIT_DATA_ROLE: ResolvedSemanticRole = {
	role: 'data', origin: 'implicit', claim: null,
}

/** Authoring outranks analysis, while clearing authoring reveals analysis again. */
export function resolveBlockPortSemanticRole(port: BlockPort): ResolvedSemanticRole {
	if (port.semanticRoleAuthored) {
		return { role: port.semanticRoleAuthored.role, origin: 'authored', claim: port.semanticRoleAuthored }
	}
	if (port.semanticRoleDerived) {
		return { role: port.semanticRoleDerived.role, origin: 'derived', claim: port.semanticRoleDerived }
	}
	return IMPLICIT_DATA_ROLE
}

/** A branch band is an operator input, whereas both Loop ports remain Data. */
export function resolveHostPortSemanticRole(
	host: PortHostShape,
	portId: string,
): ResolvedSemanticRole {
	if (isBranchShape(host) && host.props.controls.some((port) => port.id === portId)) {
		return {
			role: 'control',
			origin: 'derived',
			claim: { role: 'control', source: 'Branch control band' },
		}
	}
	if (isLoopShape(host)) return IMPLICIT_DATA_ROLE
	if (isBlockShape(host)) {
		const port = [...host.props.inputs, ...host.props.outputs].find((candidate) => candidate.id === portId)
		return port ? resolveBlockPortSemanticRole(port) : IMPLICIT_DATA_ROLE
	}
	return IMPLICIT_DATA_ROLE
}

export function resolveLivePortSemanticRole(
	editor: Editor,
	hostId: TLShapeId,
	portId: string,
): ResolvedSemanticRole {
	const host = editor.getShape(hostId)
	return isPortHostShape(host) && getPortHostPort(editor, host, portId)
		? resolveHostPortSemanticRole(host, portId)
		: IMPLICIT_DATA_ROLE
}

export interface ConnectionSemanticRole {
	effective: ResolvedSemanticRole
	source: ResolvedSemanticRole | null
	sink: ResolvedSemanticRole | null
	/** Half-bound cables intentionally have no invented endpoint claim. */
	halfBound: boolean
	/** Both explicit endpoint claims disagree; legal, readable, and non-mutating. */
	conflict: boolean
	label: string
	warning: string | null
}

function roleForBinding(editor: Editor, binding: ConnectionBinding | undefined): ResolvedSemanticRole | null {
	if (!binding) return null
	return resolveLivePortSemanticRole(editor, binding.toId, binding.props.portId)
}

function explicit(role: ResolvedSemanticRole | null): role is ResolvedSemanticRole {
	return role !== null && role.origin !== 'implicit'
}

/**
 * Source claims win over sink claims. A sink still contributes if the source
 * says nothing; conflict is descriptive only, because rejecting a wire would
 * make an exploratory board less honest than the code it is sketching.
 */
export function resolveConnectionSemanticRole(editor: Editor, connection: ConnectionShape): ConnectionSemanticRole {
	const bindings = getConnectionBindings(editor, connection)
	const direction = getConnectionDirection(editor, connection)
	const source = roleForBinding(editor, bindings[direction.sourceTerminal])
	const sink = roleForBinding(editor, bindings[direction.sinkTerminal])
	const sourceExplicit = explicit(source)
	const sinkExplicit = explicit(sink)
	const effective = sourceExplicit ? source : sinkExplicit ? sink : IMPLICIT_DATA_ROLE
	const conflict = sourceExplicit && sinkExplicit && source.role !== sink.role
	const label = conflict && source && sink
		? `${roleLabel(source.role)} → ${roleLabel(sink.role)}`
		: roleLabel(effective.role)
	return {
		effective,
		source,
		sink,
		halfBound: !bindings.start || !bindings.end,
		conflict,
		label,
		warning: conflict
			? `Semantic-role mismatch: source is ${roleLabel(source!.role)} while sink is ${roleLabel(sink!.role)}. The cable remains legal.`
			: null,
	}
}

export function roleLabel(role: SemanticPortRole): string {
	return role === 'configuration' ? 'Configuration' : role[0].toUpperCase() + role.slice(1)
}

export function roleOriginLabel(resolved: ResolvedSemanticRole | null): string {
	if (!resolved) return 'Unbound'
	if (resolved.origin === 'implicit') return 'Implicit Data'
	const provenance = [resolved.claim?.source, resolved.claim?.analyzer].filter(Boolean).join(' · ')
	return `${resolved.origin === 'authored' ? 'Authored override' : 'Derived'}${provenance ? ` — ${provenance}` : ''}`
}

/** Keeps option lists executable and protects imported/raw records at the seam. */
export function isSemanticPortRole(value: string): value is SemanticPortRole {
	return (SEMANTIC_PORT_ROLES as readonly string[]).includes(value)
}
