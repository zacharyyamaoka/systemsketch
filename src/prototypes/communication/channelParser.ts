/**
 * The strict V1 channel-name parser, and nothing else.
 *
 * WHY a leaf: the port layout has to ask "which interaction does this port
 * belong to?" in order to keep an Action's legs together when it infers a
 * placement, and the layout sits UNDER `blockPorts`, which the projection
 * imports. Reading the parser out of the projection would close that ring.
 * Everything here is pure string work with no tldraw, no editor and no layout.
 *
 * `communicationProjection` re-exports all of it, so every existing import
 * keeps working and there is still one public name for each of these.
 */

export type CommunicationFamily = 'topic' | 'stream' | 'service' | 'action'

export type CommunicationPhase =
	| 'publish'
	| 'stream'
	| 'request'
	| 'response'
	| 'goal'
	| 'cancel'
	| 'feedback'
	| 'result'

export interface CommunicationChannelDescriptorFields {
	family: CommunicationFamily
	phase: CommunicationPhase
	name: string
	bidirectional: boolean
	provenance: 'strict-port-name'
}

export type CommunicationAssociationIssueKind =
	| 'missing-interaction-name'
	| 'conflicting-endpoint-claims'
	| 'missing-required-phase'
	| 'duplicate-phase'
	| 'reversed-phase'

const ACTION_PHASES: Readonly<Record<string, CommunicationPhase>> = {
	goal: 'goal',
	cancel: 'cancel',
	feedback: 'feedback',
	result: 'result',
}

const SERVICE_PHASES: Readonly<Record<string, CommunicationPhase>> = {
	req: 'request',
	request: 'request',
	query: 'request',
	reply: 'response',
	response: 'response',
}

function finalToken(name: string): string {
	return name.trim().toLowerCase().split(/[._:/-]+/).filter(Boolean).at(-1) ?? ''
}

function communicationName(name: string, phase: string): string {
	const normalized = name.trim()
	if (normalized === '') return phase
	const tokens = normalized.split(/[._:/-]+/).filter(Boolean)
	if (tokens.length > 1 && tokens.at(-1)?.toLowerCase() === phase) tokens.pop()
	return tokens.join('.') || phase
}

type ParsedCommunicationChannel = CommunicationChannelDescriptorFields

export interface CommunicationChannelInspection {
	parsed: ParsedCommunicationChannel | null
	issue: { kind: CommunicationAssociationIssueKind; message: string } | null
}

interface MultiLegCandidate {
	family: 'action' | 'service'
	phase: CommunicationPhase
	name: string | null
}

function multiLegCandidate(name: string): MultiLegCandidate | null {
	const token = finalToken(name)
	const family = token in ACTION_PHASES ? 'action' : token in SERVICE_PHASES ? 'service' : null
	if (!family) return null
	return {
		family,
		phase: family === 'action' ? ACTION_PHASES[token] : SERVICE_PHASES[token],
		name: name.trim().split(/[._:/-]+/).filter(Boolean).length > 1
			? communicationName(name, token)
			: null,
	}
}

/**
 * Strict V1 inference for a canonical data edge.
 *
 * Action and Service are multi-leg protocols, so a bare `goal` or `response`
 * cannot identify which interaction owns the leg. At least one endpoint must
 * provide `interaction.phase`; if both endpoints make claims, they must agree.
 * Topic and Stream remain single-edge classifications and need no grouping key.
 */
export function inspectCommunicationChannel(
	sourcePortName: string,
	targetPortName: string,
): CommunicationChannelInspection {
	const sourceClaim = multiLegCandidate(sourcePortName)
	const targetClaim = multiLegCandidate(targetPortName)
	const claims = [sourceClaim, targetClaim].filter((claim): claim is MultiLegCandidate => Boolean(claim))
	if (claims.length > 0) {
		const namedClaims = claims.filter((claim) => claim.name !== null)
		if (namedClaims.length === 0) {
			return {
				parsed: null,
				issue: {
					kind: 'missing-interaction-name',
					message: `Reserved phase name needs an interaction prefix: ${sourcePortName} → ${targetPortName}`,
				},
			}
		}
		const canonical = namedClaims[0]
		const conflict = namedClaims.find((claim) =>
			claim.family !== canonical.family
			|| claim.phase !== canonical.phase
			|| claim.name?.toLowerCase() !== canonical.name?.toLowerCase())
		if (conflict) {
			return {
				parsed: null,
				issue: {
					kind: 'conflicting-endpoint-claims',
					message: `Endpoint protocol claims disagree: ${sourcePortName} → ${targetPortName}`,
				},
			}
		}
		return {
			parsed: {
				family: canonical.family,
				phase: canonical.phase,
				name: canonical.name!,
				bidirectional: true,
				provenance: 'strict-port-name',
			},
			issue: null,
		}
	}
	const sourceToken = finalToken(sourcePortName)
	const targetToken = finalToken(targetPortName)
	const stream = [sourceToken, targetToken].some((candidate) =>
		['stream', 'preview', 'chunk', 'chunks'].includes(candidate))
	if (stream) {
		return {
			parsed: {
				family: 'stream',
				phase: 'stream',
				name: communicationName(sourcePortName || targetPortName, sourceToken),
				bidirectional: false,
				provenance: 'strict-port-name',
			},
			issue: null,
		}
	}
	return {
		parsed: {
			family: 'topic',
			phase: 'publish',
			name: sourcePortName.trim() || targetPortName.trim() || 'message',
			bidirectional: false,
			provenance: 'strict-port-name',
		},
		issue: null,
	}
}

export function parseCommunicationChannel(
	sourcePortName: string,
	targetPortName: string,
): ParsedCommunicationChannel | null {
	return inspectCommunicationChannel(sourcePortName, targetPortName).parsed
}

export function phaseLabel(phase: CommunicationPhase): string {
	return phase === 'publish' ? 'topic' : phase
}
