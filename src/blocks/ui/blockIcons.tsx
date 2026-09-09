/**
 * The curated pyblocks icon registry, plus `BlockIconRefGlyph`, the one
 * renderer for the full `BlockIconRef` encoding (curated Lucide name, any
 * other Lucide name, an emoji, or an uploaded asset). See
 * `ui/iconPicker/iconRef.ts` for what a Block's icon IS.
 *
 * A Block stores only the icon name. Unknown names deliberately render as no
 * decoration so files written by a newer peer remain usable.
 */
import { useMaybeEditor, useValue, type TLAssetId } from 'tldraw'
import {
  ArrowRightLeft,
  BarChart3,
  Bot,
  Box,
  Boxes,
  Braces,
  Camera,
  CircuitBoard,
  Cloud,
  Copy,
  Cpu,
  Database,
  FileText,
  Filter,
  Folder,
  GitBranch,
  Globe,
  HardDrive,
  Image,
  Layers,
  Lock,
  MessageSquare,
  Network,
  Package,
  PackagePlus,
  Repeat,
  Search,
  Server,
  Settings,
  Shuffle,
  SquareFunction,
  Table,
  Terminal,
  Timer,
  User,
  Users,
  Workflow,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { BlockIconRef } from './iconPicker/iconRef'
import { EMOJI_FONT_FAMILY } from './iconPicker/emojiLibrary'
import { LucideNodeSvg } from './iconPicker/lucideLibrary'
import { useLucideLibrary } from './iconPicker/useLucideLibrary'

export const BLOCK_ICONS: ReadonlyArray<{
  name: string
  label: string
  Icon: LucideIcon
}> = [
  { name: 'SquareFunction', label: 'function', Icon: SquareFunction },
  { name: 'Braces', label: 'braces', Icon: Braces },
  { name: 'Terminal', label: 'terminal', Icon: Terminal },
  { name: 'Box', label: 'box', Icon: Box },
  { name: 'Boxes', label: 'boxes', Icon: Boxes },
  { name: 'Package', label: 'package', Icon: Package },
  { name: 'PackagePlus', label: 'bundle', Icon: PackagePlus },
  { name: 'Layers', label: 'layers', Icon: Layers },
  { name: 'Workflow', label: 'workflow', Icon: Workflow },
  { name: 'GitBranch', label: 'branch', Icon: GitBranch },
  { name: 'ArrowRightLeft', label: 'transform', Icon: ArrowRightLeft },
  { name: 'Filter', label: 'filter', Icon: Filter },
  { name: 'Shuffle', label: 'shuffle', Icon: Shuffle },
  { name: 'Copy', label: 'copy', Icon: Copy },
  { name: 'Repeat', label: 'loop', Icon: Repeat },
  { name: 'Cpu', label: 'cpu', Icon: Cpu },
  { name: 'CircuitBoard', label: 'circuit', Icon: CircuitBoard },
  { name: 'Server', label: 'server', Icon: Server },
  { name: 'HardDrive', label: 'disk', Icon: HardDrive },
  { name: 'Database', label: 'database', Icon: Database },
  { name: 'Cloud', label: 'cloud', Icon: Cloud },
  { name: 'Globe', label: 'globe', Icon: Globe },
  { name: 'Network', label: 'network', Icon: Network },
  { name: 'Table', label: 'table', Icon: Table },
  { name: 'BarChart3', label: 'chart', Icon: BarChart3 },
  { name: 'FileText', label: 'file', Icon: FileText },
  { name: 'Folder', label: 'folder', Icon: Folder },
  { name: 'Image', label: 'image', Icon: Image },
  { name: 'Camera', label: 'camera', Icon: Camera },
  { name: 'MessageSquare', label: 'message', Icon: MessageSquare },
  { name: 'Bot', label: 'bot', Icon: Bot },
  { name: 'User', label: 'user', Icon: User },
  { name: 'Users', label: 'users', Icon: Users },
  { name: 'Search', label: 'search', Icon: Search },
  { name: 'Lock', label: 'lock', Icon: Lock },
  { name: 'Settings', label: 'settings', Icon: Settings },
  { name: 'Wrench', label: 'wrench', Icon: Wrench },
  { name: 'Zap', label: 'zap', Icon: Zap },
  { name: 'Timer', label: 'timer', Icon: Timer },
]

const byName = new Map(BLOCK_ICONS.map((entry) => [entry.name, entry]))

export function blockIconEntry(name: string) {
  return byName.get(name) ?? null
}

export function BlockIconGlyph({
  name,
  size,
  className,
}: {
  name: string
  size: number
  className?: string
}) {
  const entry = byName.get(name)
  if (!entry) return null
  const { Icon } = entry
  return <Icon size={size} className={className} aria-hidden="true" />
}

/** An empty box the size of the glyph, so layout doesn't jump while it loads or resolves. */
function IconGlyphPlaceholder({ size, className }: { size: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{ display: 'inline-block', width: size, height: size }}
    />
  )
}

function DynamicLucideGlyph({ name, size, className }: { name: string; size: number; className?: string }) {
  // WHY: this component (not `LucideRefGlyph`) is the one that calls the
  // hook, so a curated name never triggers the ~1,800-icon chunk fetch —
  // `LucideRefGlyph` returns the static import for those without mounting
  // this component at all.
  const library = useLucideLibrary()
  if (!library) return <IconGlyphPlaceholder size={size} className={className} />
  const entry = library.byName.get(name)
  // Same "unknown name renders as nothing" contract as the curated set —
  // a board saved by a newer peer with an icon this build doesn't know yet.
  if (!entry) return null
  return <LucideNodeSvg node={entry.node} size={size} className={className} />
}

function LucideRefGlyph({ name, size, className }: { name: string; size: number; className?: string }) {
  const curated = byName.get(name)
  if (curated) {
    const { Icon } = curated
    return <Icon size={size} className={className} aria-hidden="true" />
  }
  return <DynamicLucideGlyph name={name} size={size} className={className} />
}

function EmojiRefGlyph({ char, size, className }: { char: string; size: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        fontFamily: EMOJI_FONT_FAMILY,
        fontSize: Math.round(size * 0.9),
        lineHeight: 1,
        display: 'inline-block',
        width: size,
        height: size,
      }}
    >
      {char}
    </span>
  )
}

function AssetRefGlyph({ assetId, size, className }: { assetId: TLAssetId; size: number; className?: string }) {
  const editor = useMaybeEditor()
  const src = useValue(
    'block icon asset src',
    () => {
      if (!editor) return null
      const asset = editor.getAsset(assetId)
      return asset && asset.type === 'image' ? asset.props.src : null
    },
    [editor, assetId],
  )
  // WHY: `BlockIconRefGlyph` is also reachable from export/report code paths
  // that may render outside a mounted `<Tldraw>`; without an editor there is
  // no way to resolve the asset record yet, so hold the glyph's box instead
  // of assuming the image is missing.
  if (!editor) return <IconGlyphPlaceholder size={size} className={className} />
  if (!src) return null
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className={className}
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  )
}

/** Renders a Block's decoded icon, every kind: none, Lucide, emoji, or an uploaded asset. */
export function BlockIconRefGlyph({
  icon,
  size,
  className,
}: {
  icon: BlockIconRef
  size: number
  className?: string
}) {
  switch (icon.kind) {
    case 'none':
      return null
    case 'lucide':
      return <LucideRefGlyph name={icon.name} size={size} className={className} />
    case 'emoji':
      return <EmojiRefGlyph char={icon.char} size={size} className={className} />
    case 'asset':
      return <AssetRefGlyph assetId={icon.assetId} size={size} className={className} />
  }
}
