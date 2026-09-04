import type { CSSProperties } from 'react'

import type { ControlIcon } from './controlIconModel'
import './control-icons.css'

function ControlIconGlyph({ icon }: { icon: ControlIcon }) {
	if (icon.kind === 'break') {
		return (
			<svg viewBox="0 0 20 20" aria-hidden="true">
				<polygon points="18,10 15.66,15.66 10,18 4.34,15.66 2,10 4.34,4.34 10,2 15.66,4.34" />
				<text x="10" y="13.3" textAnchor="middle">!</text>
			</svg>
		)
	}

	return (
		<svg viewBox="0 0 28 20" aria-hidden="true">
			<rect x="2" y="1.5" width="24" height="17" rx="8.5" />
			<text x="14" y="13.5" textAnchor="middle">»</text>
		</svg>
	)
}

/**
 * The same tiny, red-ink family is used in a Loop header and a Branch-arm
 * header. Keeping this dumb is deliberate: placement belongs to the offline
 * Python pass, while this renderer only reflects persisted shape metadata.
 */
export function ControlIconBadges({
	icons,
	testId,
	style,
}: {
	icons: readonly ControlIcon[] | undefined
	testId: string
	style?: CSSProperties
}) {
	if (!icons?.length) return null
	return (
		<span
			className="systemsketch-controlIcons"
			data-testid={testId}
			aria-label={icons.map((icon) => `${icon.kind} on line ${icon.line}`).join(', ')}
			style={style}
		>
			{icons.map((icon, index) => (
				<span
					key={`${icon.kind}:${icon.line}:${index}`}
					className="systemsketch-controlIcon"
					data-control-kind={icon.kind}
					data-control-line={icon.line}
					data-testid={`${testId}-${icon.kind}-${icon.line}`}
					title={`${icon.kind} · Python line ${icon.line}`}
				>
					<ControlIconGlyph icon={icon} />
				</span>
			))}
		</span>
	)
}
