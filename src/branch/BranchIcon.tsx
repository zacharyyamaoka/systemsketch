/**
 * The Branch tool glyph: a fork — one stem, two prongs, the mark Zach kept
 * from the authoring babble. Inline SVG so the tool stays self-contained.
 */
export function BranchIcon() {
	return (
		<div
			className="tlui-icon__placeholder systemsketch-branch-icon"
			style={{ display: 'grid', placeItems: 'center', color: 'currentColor' }}
		>
			<svg
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinecap="round"
				strokeLinejoin="round"
				style={{ display: 'block' }}
				aria-hidden="true"
			>
				<path d="M12 20.5v-7.5" />
				<path d="M12 13 6.5 7.5M12 13l5.5-5.5" />
				<circle cx="6.5" cy="5.5" r="2" />
				<circle cx="17.5" cy="5.5" r="2" />
				<circle cx="12" cy="20.5" r="0.6" fill="currentColor" />
			</svg>
		</div>
	)
}
