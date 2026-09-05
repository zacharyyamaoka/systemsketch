import { FrameShapeTool, type TLFrameShape, type TLShape } from 'tldraw'

import {
	ASYNC_REGION_TOOL_ID,
	asyncRegionMeta,
} from './asyncRegionModel'

/**
 * The stock Frame gesture with one semantic stamp.
 *
 * FrameShapeTool remains responsible for drawing, enclosure, pointer capture,
 * cancellation, history, and selection. The only product-owned behavior is
 * the metadata and title that distinguish this frame as an Async region.
 */
export class AsyncRegionTool extends FrameShapeTool {
	static override id = ASYNC_REGION_TOOL_ID
	static override initial = 'idle'

	override onCreate(created: TLShape | null): void {
		if (!created || created.type !== 'frame') return
		this.editor.updateShape<TLFrameShape>({
			id: created.id,
			type: 'frame',
			props: { name: 'Async region', color: 'violet' },
			meta: asyncRegionMeta(created.meta),
		})
		super.onCreate(this.editor.getShape(created.id) ?? created)
		if (this.editor.getInstanceState().isToolLocked) {
			this.editor.setCurrentTool(ASYNC_REGION_TOOL_ID)
		}
	}
}
