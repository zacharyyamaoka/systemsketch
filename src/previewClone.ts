import type { Editor, TLAssetId, TLEditorSnapshot } from 'tldraw'
import { hydrateCustomColors } from './appearance/customColors'
import { readPreviewClone } from './releaseClient'

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)))
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Could not copy a local board image.')))
    reader.readAsDataURL(blob)
  })
}

/** Make browser-local asset blobs portable before handing a board to Preview. */
export async function getPortablePreviewSnapshot(editor: Editor): Promise<TLEditorSnapshot> {
  const snapshot = structuredClone(editor.getSnapshot())
  const store = snapshot.document.store as unknown as Record<
    string,
    { id: string; typeName: string; props: Record<string, unknown> & { src?: unknown } }
  >
  for (const [id, record] of Object.entries(store)) {
    if (record.typeName !== 'asset' || typeof record.props.src !== 'string' || !record.props.src.startsWith('asset:')) {
      continue
    }
    const url = await editor.resolveAssetUrl(record.id as TLAssetId, { shouldResolveToOriginal: true })
    if (!url) continue
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Could not copy local board asset ${id}.`)
    store[id] = {
      ...record,
      props: { ...record.props, src: await blobToDataUrl(await response.blob()) },
    }
  }
  return snapshot
}

/** Consume the one-time Stable → Preview handoff without dropping a preset query. */
export async function loadPreviewCloneFromCurrentUrl(editor: Editor): Promise<boolean> {
  const url = new URL(window.location.href)
  const token = url.searchParams.get('previewClone')
  if (!token) return false
  const snapshot = await readPreviewClone(token)
  // The clone is validated as it loads, so any custom colour it names must
  // already be registered — the same rule as opening a file.
  hydrateCustomColors(JSON.stringify(snapshot), editor)
  editor.loadSnapshot(snapshot as TLEditorSnapshot, { forceOverwriteSessionState: true })
  url.searchParams.delete('previewClone')
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  return true
}
