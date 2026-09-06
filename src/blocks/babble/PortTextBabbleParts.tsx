import type { ReactNode } from 'react'

import type { BlockPort } from '../blockModel'
import type { InvalidPortLine } from './portTextShared'

/**
 * The read view's bullet, per variant — this babble's answer to "the sketch's
 * circular bullets look meaningful, but meaningful how?" Each variant commits
 * to a DIFFERENT real fact rather than all guessing the same one, so the
 * review board puts three honest answers side by side instead of one.
 */
export function PortBullet({ filled, title }: { filled: boolean; title: string }) {
	return <span className="PortTextBabble-bullet" data-filled={filled || undefined} title={title} aria-hidden="true" />
}

/** Bold name, muted punctuation, a coloured type, and — only when there is
 * one — a light pill for the default/expression value. One row's worth of
 * spans, shared by every variant's read view. */
export function PortTextRow({
	port,
	bulletFilled,
	bulletTitle,
	invalidDefault,
}: {
	port: Pick<BlockPort, 'name' | 'type' | 'defaultValue'>
	bulletFilled: boolean
	bulletTitle: string
	invalidDefault?: boolean
}) {
	return (
		<div className="PortTextBabble-row">
			<PortBullet filled={bulletFilled} title={bulletTitle} />
			<span className="PortTextBabble-name">{port.name || ' '}</span>
			{port.type ? <span className="PortTextBabble-punct">: </span> : null}
			{port.type ? <span className="PortTextBabble-type">{port.type}</span> : null}
			{port.defaultValue ? (
				<span className={`PortTextBabble-pill${invalidDefault ? ' PortTextBabble-pill--invalid' : ''}`} title={invalidDefault ? 'not in the restricted literal/call subset' : undefined}>
					{port.defaultValue}
				</span>
			) : null}
		</div>
	)
}

export function SectionRule() {
	return <div className="PortTextBabble-rule" role="separator" />
}

export function SectionHeading({ children }: { children: ReactNode }) {
	return <div className="PortTextBabble-sectionHeading">{children}</div>
}

/** A quiet, dismissible-by-fixing banner for lines the grammar could not
 * place — never blocks anything, never discards the line; just says why it
 * did not become a port. */
export function DiagnosticsBanner({ invalid }: { invalid: readonly InvalidPortLine[] }) {
	if (invalid.length === 0) return null
	return (
		<div className="PortTextBabble-diagnostics" data-testid="port-text-diagnostics">
			{invalid.map((entry) => (
				<div key={entry.line} className="PortTextBabble-diagnosticRow">
					<span className="PortTextBabble-diagnosticLine">L{entry.line + 1}</span>
					<span className="PortTextBabble-diagnosticText">{entry.reason}</span>
				</div>
			))}
		</div>
	)
}

export function regionStyle(top: number, bottom: number) {
	return { top, height: Math.max(0, bottom - top) }
}
