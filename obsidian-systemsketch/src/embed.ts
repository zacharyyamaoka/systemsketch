import { Component, Notice, type App, type TFile } from 'obsidian'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { EmbedToHostMessage } from '../../src/embed/sharedWithHost'
import { EmbeddedCanvas, type EmbeddedCanvasProps } from '../../src/embed/EmbeddedCanvas'
import { currentColorScheme, newSession, ObsidianEmbedBridge } from './bridge'

const RELOAD_DEBOUNCE_MS = 300

export interface EmbedContext {
  containerEl: HTMLElement
  sourcePath?: string
}

export class SystemSketchEmbed extends Component {
  private readonly shell: HTMLElement
  private bridge: ObsidianEmbedBridge | null = null
  private root: Root | null = null
  private session = newSession()
  private version = 0
  private currentText = ''
  private reloadTimer: number | null = null
  private themeObserver: MutationObserver | null = null
  private bridgeReady = false
  private loadRequested = false

  constructor(
    private readonly app: App,
    context: EmbedContext,
    private readonly file: TFile,
  ) {
    super()
    context.containerEl.addClass('systemsketch-obsidian-embed-container')
    this.shell = context.containerEl.createDiv({
      cls: 'systemsketch-obsidian-scope systemsketch-obsidian-embed',
      attr: {
        'data-testid': 'systemsketch-obsidian-embed',
        'aria-label': `Read-only SystemSketch preview of ${file.name}`,
      },
    })
    const alt = context.containerEl.getAttribute('alt') ?? ''
    const size = /^\s*(\d{2,4})(?:\s*x\s*(\d{2,4}))?\s*$/.exec(alt)
    this.shell.style.height = `${size ? Number(size[2] ?? size[1]) : 360}px`
    if (size?.[2]) this.shell.style.maxWidth = `${Number(size[1])}px`
    this.shell.addEventListener('dblclick', () => {
      void this.app.workspace.openLinkText(this.file.path, context.sourcePath ?? this.file.path, true)
    })
  }

  override onload(): void {
    this.bridge = new ObsidianEmbedBridge((message) => this.receive(message))
    this.root = createRoot(this.shell)
    this.root.render(createElement<EmbeddedCanvasProps>(EmbeddedCanvas, { bridge: this.bridge }))
    this.themeObserver = new MutationObserver(() => {
      this.bridge?.send({ type: 'appearance', colorScheme: currentColorScheme() })
    })
    this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    this.registerEvent(this.app.vault.on('modify', (changed) => {
      if (changed.path !== this.file.path) return
      if (this.reloadTimer !== null) window.clearTimeout(this.reloadTimer)
      this.reloadTimer = window.setTimeout(() => {
        this.reloadTimer = null
        void this.reload()
      }, RELOAD_DEBOUNCE_MS)
    }))
  }

  override onunload(): void {
    if (this.reloadTimer !== null) window.clearTimeout(this.reloadTimer)
    this.themeObserver?.disconnect()
    this.root?.unmount()
    this.root = null
    this.bridge?.dispose()
    this.bridge = null
  }

  /** Obsidian's file-embed registry calls this after the component is loaded. */
  async loadFile(): Promise<void> {
    this.loadRequested = true
    if (this.bridgeReady) await this.open()
  }

  private receive(message: EmbedToHostMessage): void {
    if (message.type === 'ready') {
      this.bridgeReady = true
      if (this.loadRequested) void this.open()
      return
    }
    if (message.type === 'embed-error') new Notice(`SystemSketch preview: ${message.message}`)
  }

  private async open(): Promise<void> {
    this.currentText = await this.app.vault.cachedRead(this.file)
    this.version += 1
    this.bridge?.send({
      type: 'open',
      path: this.file.path,
      text: this.currentText,
      version: this.version,
      readOnly: true,
      session: this.session,
    })
    this.bridge?.send({ type: 'appearance', colorScheme: currentColorScheme() })
  }

  private async reload(): Promise<void> {
    const text = await this.app.vault.cachedRead(this.file)
    if (text === this.currentText) return
    this.currentText = text
    this.version += 1
    this.session = newSession()
    this.bridge?.send({
      type: 'external-change',
      text,
      version: this.version,
      session: this.session,
      reason: 'source-edit',
    })
  }
}
