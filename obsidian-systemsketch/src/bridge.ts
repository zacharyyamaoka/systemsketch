import type {
  EmbedHostBridge,
  EmbedToHostMessage,
  HostToEmbedMessage,
} from '../../src/embed/sharedWithHost'

/** Direct bridge for Obsidian's single renderer document. */
export class ObsidianEmbedBridge implements EmbedHostBridge {
  readonly host = 'obsidian'
  readonly build = __SYSTEMSKETCH_SOURCE_COMMIT__
  private readonly listeners = new Set<(message: HostToEmbedMessage) => void>()

  constructor(private readonly receive: (message: EmbedToHostMessage) => void) {}

  post(message: EmbedToHostMessage): void {
    this.receive(message)
  }

  subscribe(handler: (message: HostToEmbedMessage) => void): () => void {
    this.listeners.add(handler)
    return () => this.listeners.delete(handler)
  }

  send(message: HostToEmbedMessage): void {
    for (const listener of this.listeners) listener(message)
  }

  dispose(): void {
    this.listeners.clear()
  }
}

export function newSession(): string {
  return crypto.randomUUID()
}

export function currentColorScheme(): 'light' | 'dark' {
  return document.body.classList.contains('theme-dark') ? 'dark' : 'light'
}
