import { Plugin, type TFile } from 'obsidian'
import { SystemSketchEmbed, type EmbedContext } from './embed'
import { SystemSketchView, SYSTEMSKETCH_VIEW_TYPE } from './view'
import './plugin.css'

const EXTENSIONS = ['systemsketch', 'tldr'] as const
type EmbedCreator = (context: EmbedContext, file: TFile, subpath?: string) => SystemSketchEmbed
interface EmbedRegistryLike {
  registerExtension?: (extension: string, creator: EmbedCreator) => void
  unregisterExtension?: (extension: string) => void
  embedByExtension?: Record<string, EmbedCreator>
}

export default class SystemSketchPlugin extends Plugin {
  override onload(): void {
    this.registerView(SYSTEMSKETCH_VIEW_TYPE, (leaf) => new SystemSketchView(leaf))
    this.registerExtensions([...EXTENSIONS], SYSTEMSKETCH_VIEW_TYPE)
    this.registerEmbeds()
  }

  private registerEmbeds(): void {
    const registry = (this.app as unknown as { embedRegistry?: EmbedRegistryLike }).embedRegistry
    if (!registry) return
    const creator: EmbedCreator = (context, file) => new SystemSketchEmbed(this.app, context, file)
    for (const extension of EXTENSIONS) {
      if (registry.registerExtension && registry.unregisterExtension) {
        registry.registerExtension(extension, creator)
        this.register(() => registry.unregisterExtension?.(extension))
        continue
      }
      if (!registry.embedByExtension) continue
      const previous = registry.embedByExtension[extension]
      registry.embedByExtension[extension] = creator
      this.register(() => {
        if (registry.embedByExtension?.[extension] !== creator) return
        if (previous === undefined) delete registry.embedByExtension[extension]
        else registry.embedByExtension[extension] = previous
      })
    }
  }
}
