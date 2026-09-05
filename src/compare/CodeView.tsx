/**
 * The Code tab: the raw record the Properties table was computed from.
 *
 * Scoped to the selected row, like Figma's — both its Code and Properties tabs
 * show one layer at a time, never the whole document. Nothing here interprets
 * anything: it serializes the before and after records with sorted keys and
 * runs an ordinary line diff, so a reviewer can check the table's claim against
 * the bytes and catch a projector that is parsing wrongly.
 */

import { useMemo } from 'react'

import { collapseContext, lineDiff, stableJson, ELISION } from './lineDiff'
import type { CompareChange } from './compareModel'

export interface CodeViewProps {
	change: CompareChange | null
}

export function CodeView({ change }: CodeViewProps) {
	const lines = useMemo(() => {
		if (!change) return []
		return collapseContext(lineDiff(stableJson(change.recordBefore), stableJson(change.recordAfter)))
	}, [change])

	if (!change) {
		return (
			<p className="systemsketch-compare__none" data-testid="compare-code-empty">
				Select a row to see the record it was computed from.
			</p>
		)
	}

	return (
		<div className="systemsketch-compare__code" data-testid="compare-code-view">
			<header className="systemsketch-compare__code-head">
				<span className="systemsketch-compare__badge" data-kind={change.kind}>
					{change.kind}
				</span>
				<span className="systemsketch-compare__name">{change.name}</span>
				<span className="systemsketch-compare__path">
					{change.subject}
					{change.portId ? ` · ${change.portId}` : ''}
				</span>
			</header>
			<pre className="systemsketch-compare__code-body">
				{lines.map((line, index) => (
					<code
						key={index}
						className="systemsketch-compare__code-line"
						data-kind={line.kind}
						data-testid={line.kind === 'context' ? undefined : `compare-code-${line.kind}`}
					>
						<span className="systemsketch-compare__gutter">
							{line.text === ELISION ? '' : (line.beforeNumber ?? '')}
						</span>
						<span className="systemsketch-compare__gutter">
							{line.text === ELISION ? '' : (line.afterNumber ?? '')}
						</span>
						<span className="systemsketch-compare__sigil">
							{line.kind === 'removed' ? '-' : line.kind === 'added' ? '+' : ' '}
						</span>
						<span className="systemsketch-compare__code-text">{line.text}</span>
					</code>
				))}
			</pre>
		</div>
	)
}
