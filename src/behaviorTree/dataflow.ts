/**
 * Static dataflow over a Behavior Tree: which write a read actually sees.
 *
 * Zach's rule (2026-09-04): if a node writes a key and a later node reads it,
 * wire them directly; if a third node overwrites the key in between, the
 * reader is fed by that later writer. The lens is only ever *honest*: a
 * direct cable is drawn when the writer provably ran before the reader on a
 * plain sequential path, and everything else stays a Blackboard pill —
 * ambiguity is shown, not guessed away.
 *
 * "Provably before" means: take the lowest common ancestor of writer and
 * reader; the writer's side of that ancestor may pass only through
 * sequence-like controls and decorators, and the ancestor itself must be
 * sequence-like. A writer inside a Fallback arm or a Parallel lane the reader
 * is not in may never have run, or may still be running.
 */
import type { BtNode, BtTree } from './btcppXml'
import { collectKeyAccesses, summarizeKeys, type BtKeyAccess } from './blackboardLayout'

export interface BtDirectEdge {
	key: string
	global: boolean
	fromPath: string
	fromPort: string
	toPath: string
	toPort: string
}

export interface BtDataflow {
	/** Reads fed by exactly one proven writer. */
	direct: BtDirectEdge[]
	/** Keys read with no writer anywhere in the tree: the tree's own inputs. */
	rootInputs: string[]
	/** Keys that still need a pill: ambiguous reads, unknown uses, unread writes. */
	residualKeys: string[]
	accesses: BtKeyAccess[]
}

function isSequential(node: BtNode | undefined): boolean {
	if (!node) return true
	if (node.kind === 'decorator') return true
	if (node.kind === 'control' || node.kind === 'unknown') return node.controlKind === 'sequence' || node.controlKind === 'switch' || node.controlKind === 'other'
	return true
}

function preorderIndex(tree: BtTree): Map<string, number> {
	return new Map(tree.nodes.map((node, index) => [node.path, index]))
}

function commonPrefixLength(a: string[], b: string[]): number {
	let length = 0
	while (length < a.length && length < b.length && a[length] === b[length]) length += 1
	return length
}

export function analyzeDataflow(tree: BtTree | null): BtDataflow {
	if (!tree || !tree.root) return { direct: [], rootInputs: [], residualKeys: [], accesses: [] }
	const accesses = collectKeyAccesses(tree)
	const order = preorderIndex(tree)
	const byPath = new Map(tree.nodes.map((node) => [node.path, node]))
	const direct: BtDirectEdge[] = []
	const residual = new Set<string>()
	const rootInputs: string[] = []
	const keyId = (access: Pick<BtKeyAccess, 'key' | 'global'>) => `${access.global ? '@' : ''}${access.key}`

	const provablyBefore = (writer: BtNode, reader: BtNode): boolean => {
		const writerSegments = writer.path.split('.')
		const readerSegments = reader.path.split('.')
		const shared = commonPrefixLength(writerSegments, readerSegments)
		const ancestorPath = writerSegments.slice(0, shared).join('.')
		const ancestor = byPath.get(ancestorPath)
		if (!ancestor || !isSequential(ancestor)) return false
		// Every control strictly between the ancestor and the writer must be sequential.
		for (let depth = shared + 1; depth < writerSegments.length; depth += 1) {
			const node = byPath.get(writerSegments.slice(0, depth).join('.'))
			if (!isSequential(node)) return false
		}
		return true
	}

	const readsSeen = new Set<string>()
	for (const access of accesses) {
		if (access.direction === 'use') {
			residual.add(keyId(access))
			continue
		}
		if (access.direction !== 'read') continue
		const reader = byPath.get(access.path)!
		const readerIndex = order.get(access.path)!
		const writers = accesses.filter((candidate) => (
			candidate.direction === 'write'
			&& candidate.key === access.key
			&& candidate.global === access.global
			&& candidate.path !== access.path
			&& order.get(candidate.path)! < readerIndex
		))
		readsSeen.add(keyId(access))
		if (writers.length === 0) {
			const anyWriter = accesses.some((candidate) => candidate.direction === 'write' && candidate.key === access.key && candidate.global === access.global)
			if (anyWriter) residual.add(keyId(access))
			else if (!rootInputs.includes(keyId(access))) rootInputs.push(keyId(access))
			continue
		}
		const latest = writers[writers.length - 1]
		const writer = byPath.get(latest.path)!
		if (provablyBefore(writer, reader)) {
			direct.push({ key: access.key, global: access.global, fromPath: latest.path, fromPort: latest.portName, toPath: access.path, toPort: access.portName })
		} else {
			residual.add(keyId(access))
		}
	}
	// A key written but never read is an output of the tree: keep its pill.
	for (const summary of summarizeKeys(accesses)) {
		const id = keyId(summary)
		if (summary.writes.length > 0 && summary.reads.length === 0) residual.add(id)
	}
	return { direct, rootInputs, residualKeys: [...residual], accesses }
}
