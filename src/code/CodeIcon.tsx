/** A compact `<>` glyph keeps Code visually distinct from the semantic Block. */
export function CodeIcon() {
	return (
		<div
			className="tlui-icon__placeholder systemsketch-code-icon"
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
				<path d="m8.2 6.4-5.1 5.6 5.1 5.6M15.8 6.4l5.1 5.6-5.1 5.6M13.8 4.2l-3.6 15.6" />
			</svg>
		</div>
	)
}
