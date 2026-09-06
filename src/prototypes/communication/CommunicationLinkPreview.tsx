import { useEditor, useValue } from 'tldraw'

import { COMMUNICATION_FAMILY_PAINT, communicationProjection } from './communicationProjection'
import { communicationLinkDraft } from './CommunicationLinkTool'

/**
 * The arrow while it is still in the air.
 *
 * Nothing is written to the document until the gesture lands, so the in-flight
 * line is chrome rather than a shape. It is drawn in **viewport** space — the
 * space `InFrontOfTheCanvas` documents — by projecting the two page points
 * through the camera, which is also why a highlighted landing needs no
 * per-frame subscription beyond the one `useValue` below.
 */
export function CommunicationLinkPreview() {
	const editor = useEditor()
	const view = useValue(
		'communication link preview',
		() => {
			const draft = communicationLinkDraft.get(editor)
			if (!draft.origin || !draft.pointer || !draft.initiatorId) return null
			const viewport = editor.getViewportScreenBounds()
			const start = editor.pageToScreen(draft.origin)
			const end = editor.pageToScreen(draft.pointer)
			const hover = draft.hoverId ? editor.getShapePageBounds(draft.hoverId) : null
			const hoverBox = hover
				? (() => {
					const min = editor.pageToScreen({ x: hover.minX, y: hover.minY })
					const max = editor.pageToScreen({ x: hover.maxX, y: hover.maxY })
					return {
						x: min.x - viewport.x,
						y: min.y - viewport.y,
						w: max.x - min.x,
						h: max.y - min.y,
					}
				})()
				: null
			return {
				family: communicationProjection.get(editor).drawFamily,
				x1: start.x - viewport.x,
				y1: start.y - viewport.y,
				x2: end.x - viewport.x,
				y2: end.y - viewport.y,
				hoverBox,
			}
		},
		[editor],
	)
	if (!view) return null
	const paint = COMMUNICATION_FAMILY_PAINT[view.family]
	const markerId = `communication-link-preview-head-${view.family}`

	return (
		<svg
			className="communication-link-preview"
			data-testid="communication-link-preview"
			data-family={view.family}
			aria-hidden="true"
		>
			<defs>
				<marker
					id={markerId}
					markerWidth="9"
					markerHeight="9"
					refX="7"
					refY="4.5"
					orient="auto"
				>
					<path d="M 0 0 L 9 4.5 L 0 9 z" fill={paint.ink} />
				</marker>
			</defs>
			{view.hoverBox ? (
				<rect
					x={view.hoverBox.x}
					y={view.hoverBox.y}
					width={view.hoverBox.w}
					height={view.hoverBox.h}
					rx="8"
					fill={paint.soft}
					fillOpacity="0.45"
					stroke={paint.ink}
					strokeWidth="2"
				/>
			) : null}
			<line
				x1={view.x1}
				y1={view.y1}
				x2={view.x2}
				y2={view.y2}
				stroke={paint.ink}
				strokeWidth="2.5"
				strokeLinecap="round"
				markerEnd={`url(#${markerId})`}
			/>
		</svg>
	)
}
