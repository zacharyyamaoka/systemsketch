/**
 * The curated pyblocks icon registry.
 *
 * A Block stores only the icon name. Unknown names deliberately render as no
 * decoration so files written by a newer peer remain usable.
 */
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
