import {
	TldrawUiButton,
	TldrawUiPopover,
	TldrawUiPopoverContent,
	TldrawUiPopoverTrigger,
	useEditor,
} from 'tldraw'
import { useId, useState } from 'react'

import { useLocalWorkspace } from '../workspace/LocalWorkspace'
import { exportPortableTldraw } from './portableTldraw'
import './portable-export.css'

function exportStem(title: string): string {
	const stem = title.replace(/\.(?:systemsketch|tldr)$/i, '').trim()
	return stem || 'Untitled'
}

function downloadText(source: string, filename: string): void {
	const url = URL.createObjectURL(new Blob([source], { type: 'application/vnd.tldraw+json' }))
	const anchor = document.createElement('a')
	anchor.href = url
	anchor.download = filename
	anchor.style.display = 'none'
	document.body.appendChild(anchor)
	anchor.click()
	anchor.remove()
	window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function PortableShareButton() {
	const editor = useEditor()
	const workspace = useLocalWorkspace()
	const popoverId = `systemsketch-share-${useId()}`
	const [open, setOpen] = useState(false)
	const [busy, setBusy] = useState(false)
	const [message, setMessage] = useState<string | null>(null)

	const downloadPortable = async () => {
		if (busy) return
		setBusy(true)
		setMessage(null)
		try {
			const source = await exportPortableTldraw(editor)
			downloadText(source, `${exportStem(workspace.title)}-portable.tldr`)
			setMessage('Downloaded a stock-tldraw copy. Your live board was not changed.')
		} catch (cause) {
			setMessage(cause instanceof Error ? cause.message : String(cause))
		} finally {
			setBusy(false)
		}
	}

	const copyPath = async () => {
		if (!workspace.path) return
		try {
			await navigator.clipboard.writeText(workspace.path)
			setMessage('Board path copied.')
		} catch {
			setMessage('The board path could not be copied.')
		}
	}

	return (
		<TldrawUiPopover
			id={popoverId}
			open={open}
			onOpenChange={(next) => {
				setOpen(next)
				if (!next) setMessage(null)
			}}
		>
			<TldrawUiPopoverTrigger>
				<TldrawUiButton
					type="primary"
					className="systemsketch-share-button"
					title="Share and export"
					aria-expanded={open}
					data-testid="systemsketch-share-button"
				>
					Share
				</TldrawUiButton>
			</TldrawUiPopoverTrigger>
			<TldrawUiPopoverContent side="bottom" align="end" sideOffset={10} collisionPadding={12}>
				<section
					className="systemsketch-share-menu"
					aria-label="Share and export"
					data-testid="systemsketch-share-menu"
					data-systemsketch-chrome
				>
					<header>
						<span>Local board</span>
						<h2>Share &amp; export</h2>
					</header>
					<button type="button" onClick={() => void copyPath()} disabled={!workspace.path}>
						<span><b>Copy board path</b><small>Give an agent the exact local document.</small></span>
						<em aria-hidden="true">⌘</em>
					</button>
					<button
						type="button"
						data-testid="export-portable-tldr"
						disabled={busy}
						onClick={() => void downloadPortable()}
					>
						<span>
							<b>{busy ? 'Preparing portable copy…' : 'Download portable .tldr'}</b>
							<small>Blocks become stock shapes; the open board stays semantic.</small>
						</span>
						<em aria-hidden="true">↓</em>
					</button>
					{message ? <p role="status">{message}</p> : null}
				</section>
			</TldrawUiPopoverContent>
		</TldrawUiPopover>
	)
}
