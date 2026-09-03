import { Notice, TextFileView, type TFile, type WorkspaceLeaf } from 'obsidian'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  createCompatibilityCopyText,
  documentTitle,
  newerDocumentVersion,
  type EmbedToHostMessage,
} from '../../src/embed/sharedWithHost'
import { EmbeddedCanvas, type EmbeddedCanvasProps } from '../../src/embed/EmbeddedCanvas'
import { currentColorScheme, newSession, ObsidianEmbedBridge } from './bridge'

export const SYSTEMSKETCH_VIEW_TYPE = 'systemsketch-obsidian.editor'
const FINAL_SAVE_SETTLE_MS = 450

export class SystemSketchView extends TextFileView {
  private bridge: ObsidianEmbedBridge | null = null
  private root: Root | null = null
  private host: HTMLElement | null = null
  private themeObserver: MutationObserver | null = null
  private ready = false
  private hasViewData = false
  private opened = false
  private documentPath = ''
  private version = 0
  private session = newSession()
  private expectedOwnData: string | null = null

  constructor(leaf: WorkspaceLeaf) { super(leaf) }

  getViewType(): string { return SYSTEMSKETCH_VIEW_TYPE }
  getDisplayText(): string { return this.file?.basename ?? 'SystemSketch' }
  getIcon(): string { return 'pencil-ruler' }
  getViewData(): string { return this.data ?? '' }

  override async onOpen(): Promise<void> {
    await super.onOpen()
    this.contentEl.addClass('systemsketch-obsidian-content')
    this.host = this.contentEl.createDiv({
      cls: 'systemsketch-obsidian-scope systemsketch-obsidian-editor',
      attr: { 'data-testid': 'systemsketch-obsidian-editor' },
    })
    this.mountCanvas()
  }

  override async onLoadFile(file: TFile): Promise<void> {
    await super.onLoadFile(file)
    this.mountCanvas()
  }

  override async onUnloadFile(file: TFile): Promise<void> {
    await this.finalFlush()
    this.unmountCanvas()
    await super.onUnloadFile(file)
  }

  private mountCanvas(): void {
    if (!this.host || this.root) return
    this.bridge = new ObsidianEmbedBridge((message) => this.receive(message))
    this.root = createRoot(this.host)
    this.root.render(createElement<EmbeddedCanvasProps>(EmbeddedCanvas, { bridge: this.bridge }))
    this.themeObserver = new MutationObserver(() => this.sendAppearance())
    this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] })
  }

  setViewData(data: string, clear: boolean): void {
    this.hasViewData = true
    const path = this.file?.path ?? ''
    const firstDocument = !this.opened || path !== this.documentPath || clear
    const ownEcho = !firstDocument && data === this.expectedOwnData
    const unchanged = !firstDocument && data === this.data
    this.data = data

    if (ownEcho) {
      this.expectedOwnData = null
      return
    }
    if (unchanged) return

    this.version += 1
    this.session = newSession()
    this.documentPath = path
    this.expectedOwnData = null
    if (!this.ready || !this.file) return
    if (firstDocument) this.sendOpen()
    else {
      this.bridge?.send({
        type: 'external-change',
        text: this.data,
        version: this.version,
        session: this.session,
        reason: 'source-edit',
      })
    }
  }

  clear(): void {
    this.data = ''
    this.hasViewData = false
    this.expectedOwnData = null
    this.opened = false
    this.documentPath = ''
  }

  override async onClose(): Promise<void> {
    if (this.root) {
      await this.finalFlush()
      this.unmountCanvas()
    }
    await super.onClose()
  }

  private async finalFlush(): Promise<void> {
    await new Promise((resolve) => window.setTimeout(resolve, FINAL_SAVE_SETTLE_MS))
    if (this.expectedOwnData !== null) {
      await this.save()
      this.expectedOwnData = null
    }
  }

  private unmountCanvas(): void {
    this.root?.unmount()
    this.root = null
    this.themeObserver?.disconnect()
    this.themeObserver = null
    this.bridge?.dispose()
    this.bridge = null
    this.ready = false
    this.opened = false
  }

  private receive(message: EmbedToHostMessage): void {
    if (message.type === 'ready') {
      this.ready = true
      if (this.file && this.hasViewData) this.sendOpen()
      this.sendAppearance()
      return
    }
    if (message.type === 'embed-error') {
      new Notice(`SystemSketch: ${message.message}`)
      return
    }
    if (message.type === 'request-compatible-copy') {
      void this.createCompatibilityCopy(message.session, message.baseVersion)
      return
    }
    if (message.type !== 'change' || message.session !== this.session) return

    if (message.baseVersion !== this.version) {
      this.session = newSession()
      this.bridge?.send({
        type: 'external-change',
        text: this.data,
        version: this.version,
        session: this.session,
        reason: 'stale-change',
      })
      return
    }
    if (message.text !== this.data) {
      this.data = message.text
      this.expectedOwnData = message.text
      this.version += 1
      this.requestSave()
    }
    this.bridge?.send({ type: 'accepted', version: this.version })
  }

  private sendOpen(): void {
    if (!this.bridge || !this.file) return
    this.opened = true
    this.documentPath = this.file.path
    this.bridge.send({
      type: 'open',
      path: this.file.path,
      text: this.data,
      version: this.version,
      readOnly: false,
      session: this.session,
    })
  }

  private sendAppearance(): void {
    this.bridge?.send({ type: 'appearance', colorScheme: currentColorScheme() })
  }

  private async createCompatibilityCopy(requestSession: string, baseVersion: number): Promise<void> {
    if (!this.file || requestSession !== this.session || baseVersion !== this.version) return
    if (!newerDocumentVersion(this.file.path, this.data)) return
    const parent = this.file.parent?.path === '/' ? '' : this.file.parent?.path ?? ''
    const base = `${documentTitle(this.file.path)} compatible copy`
    let name = `${base}.systemsketch`
    for (let counter = 2; this.app.vault.getAbstractFileByPath(parent ? `${parent}/${name}` : name); counter += 1) {
      name = `${base} ${counter}.systemsketch`
    }
    const path = parent ? `${parent}/${name}` : name
    const text = createCompatibilityCopyText(path, this.data)
    const file = await this.app.vault.create(path, text)
    await this.app.workspace.getLeaf('tab').openFile(file)
  }
}
