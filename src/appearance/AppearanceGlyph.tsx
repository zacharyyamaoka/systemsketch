import type { ReactElement, ReactNode } from 'react'
import { useValue, type Editor } from 'tldraw'

import type { AppearanceControl } from './appearanceModel'

/**
 * What an appearance option looks like.
 *
 * FigJam previews the value rather than naming it — the size list is drawn at
 * each size, the line endings are drawn as lines, the colours are circles. Each
 * glyph here does the same for its control, so the popover is legible without
 * reading it.
 */
export function AppearanceGlyph({
  control, value, editor,
}: {
  control: AppearanceControl
  value: string | undefined
  editor: Editor
}) {
  if (control.id === 'color') {
    return <ColorSwatch editor={editor} name={value} />
  }
  if (control.id === 'fill') {
    return <FillGlyph value={value} />
  }
  if (control.id === 'geo') {
    return <GeoGlyph value={value} />
  }
  if (control.id === 'dash') {
    return <DashGlyph value={value} />
  }
  if (control.id === 'size') {
    return <SizeGlyph value={value} />
  }
  if (control.id === 'font') {
    return <FontGlyph value={value} />
  }
  if (control.id === 'align' || control.id === 'verticalAlign') {
    return <AlignGlyph value={value} vertical={control.id === 'verticalAlign'} />
  }
  if (control.id === 'arrowKind' || control.id === 'spline') {
    return <RoutingGlyph value={value} />
  }
  return <ArrowheadGlyph value={value} atStart={control.id === 'arrowheadStart'} />
}

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 20 20" className="systemsketch-appearance__glyph" aria-hidden="true">
      {children}
    </svg>
  )
}

function ColorSwatch({ editor, name }: { editor: Editor; name: string | undefined }) {
  const fill = useValue(
    'systemsketch appearance swatch',
    () => {
      if (!name) return undefined
      // The theme map also carries flat UI colours, so read it loosely and
      // take `.solid` only where a shape colour actually provides one.
      const colors = editor.getCurrentTheme().colors[editor.getColorMode()] as
        unknown as Record<string, { solid?: string } | string | undefined>
      const entry = colors[name]
      return typeof entry === 'object' ? entry?.solid : undefined
    },
    [editor, name],
  )
  return (
    <span
      className="systemsketch-appearance__swatch"
      data-mixed={fill ? undefined : true}
      style={fill ? { background: fill } : undefined}
    />
  )
}

/** The fill treatments, drawn on the same square so they can be compared. */
function FillGlyph({ value }: { value: string | undefined }) {
  const box = <rect x="3.5" y="3.5" width="13" height="13" rx="2" />
  if (value === 'none') return <Svg>{box}</Svg>
  if (value === 'pattern' || value === 'lined-fill') {
    const lines = value === 'pattern'
      ? ['M4 12l8-8', 'M4 16l12-12', 'M8 16l8-8']
      : ['M4 8h12', 'M4 11.5h12', 'M4 15h12']
    return <Svg>{box}{lines.map((d) => <path key={d} d={d} strokeWidth={1} />)}</Svg>
  }
  const opacity = value === 'semi' ? 0.35 : value === 'solid' ? 0.7 : 1
  return (
    <Svg>
      <rect x="3.5" y="3.5" width="13" height="13" rx="2" data-role="solid" opacity={opacity} />
      {box}
    </Svg>
  )
}

/** A rough outline per geo kind — enough to tell a diamond from an ellipse. */
const GEO_PATHS: Record<string, string> = {
  rectangle: 'M3 4h14v12H3z',
  ellipse: 'M10 4a7 6 0 1 0 .01 0z',
  triangle: 'M10 3.5 17 16.5H3z',
  diamond: 'M10 3l7 7-7 7-7-7z',
  pentagon: 'M10 3l7 5-2.7 8.3H5.7L3 8z',
  hexagon: 'M6 4h8l4 6-4 6H6l-4-6z',
  octagon: 'M7 3h6l4 4v6l-4 4H7l-4-4V7z',
  star: 'M10 3l2.2 4.7 5.1.6-3.8 3.5 1 5-4.5-2.5L5.5 16.8l1-5L2.7 8.3l5.1-.6z',
  rhombus: 'M6 4h11l-3 12H3z',
  'rhombus-2': 'M3 4h11l3 12H6z',
  oval: 'M7 4h6a5 6 0 0 1 0 12H7a5 6 0 0 1 0-12z',
  trapezoid: 'M6 4h8l3 12H3z',
  cloud: 'M6 15a3.4 3.4 0 0 1 .3-6.8A4.3 4.3 0 0 1 14.4 8 3.5 3.5 0 0 1 14 15z',
  heart: 'M10 16.5S3 12.3 3 7.9A3.4 3.4 0 0 1 10 6a3.4 3.4 0 0 1 7 1.9c0 4.4-7 8.6-7 8.6z',
  'x-box': 'M3 4h14v12H3zM6.5 7.5l7 5M13.5 7.5l-7 5',
  'check-box': 'M3 4h14v12H3zM6.5 10.2l2.4 2.4 4.6-4.8',
  'arrow-right': 'M3 7.5h7V4l7 6-7 6v-3.5H3z',
  'arrow-left': 'M17 7.5h-7V4L3 10l7 6v-3.5h7z',
  'arrow-up': 'M7.5 17v-7H4l6-7 6 7h-3.5v7z',
  'arrow-down': 'M7.5 3v7H4l6 7 6-7h-3.5V3z',
}

function GeoGlyph({ value }: { value: string | undefined }) {
  return <Svg><path d={GEO_PATHS[value ?? 'rectangle'] ?? GEO_PATHS.rectangle} /></Svg>
}

const DASH_ARRAYS: Record<string, string | undefined> = {
  draw: undefined,
  solid: undefined,
  dashed: '4 3',
  dotted: '0.1 3.2',
  none: undefined,
}

function DashGlyph({ value }: { value: string | undefined }) {
  if (value === 'none') {
    return <Svg><path d="M3 17 17 3" data-role="slash" /><circle cx="10" cy="10" r="7" /></Svg>
  }
  return (
    <Svg>
      <path
        d={value === 'draw' ? 'M3 12.5c4-6 6 2 14-4.5' : 'M3 10h14'}
        strokeDasharray={DASH_ARRAYS[value ?? 'solid']}
        strokeLinecap={value === 'dotted' ? 'round' : 'butt'}
      />
    </Svg>
  )
}

/** FigJam draws each size at its own size; four bars do the same job compactly. */
const SIZE_HEIGHTS: Record<string, number> = { s: 3, m: 6, l: 9, xl: 13 }

function SizeGlyph({ value }: { value: string | undefined }) {
  const height = SIZE_HEIGHTS[value ?? 'm'] ?? 6
  return (
    <Svg>
      <rect x="3" y={10 - height / 2} width="14" height={height} rx={height / 2} data-role="solid" />
    </Svg>
  )
}

const FONT_STACKS: Record<string, string> = {
  sans: 'Inter, ui-sans-serif, system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  draw: '"Comic Sans MS", "Segoe Print", cursive',
}

function FontGlyph({ value }: { value: string | undefined }) {
  return (
    <span
      className="systemsketch-appearance__font"
      style={{ fontFamily: FONT_STACKS[value ?? 'sans'] ?? FONT_STACKS.sans }}
      aria-hidden="true"
    >
      Aa
    </span>
  )
}

/** Three lines: stacked to one side for vertical, ragged to one side for horizontal. */
const VERTICAL_ALIGN_ROWS: Record<string, readonly number[]> = {
  start: [5, 8.5, 12],
  middle: [6.5, 10, 13.5],
  end: [8, 11.5, 15],
}

function AlignGlyph({ value, vertical }: { value: string | undefined; vertical?: boolean }) {
  if (vertical) {
    const rows = VERTICAL_ALIGN_ROWS[value ?? 'middle'] ?? VERTICAL_ALIGN_ROWS.middle
    return <Svg>{rows.map((y) => <path key={y} d={`M4 ${y}h12`} />)}</Svg>
  }
  // The short middle line is what makes the alignment readable at 20px.
  const widths = [14, 8, 14]
  const start = (width: number) =>
    value === 'end' ? 17 - width : value === 'middle' ? 10 - width / 2 : 3
  return (
    <Svg>
      {widths.map((width, index) => (
        <path key={index} d={`M${start(width)} ${6 + index * 4}h${width}`} />
      ))}
    </Svg>
  )
}

function RoutingGlyph({ value }: { value: string | undefined }) {
  if (value === 'elbow') return <Svg><path d="M3 15h6V5h8" /></Svg>
  if (value === 'line') return <Svg><path d="M3 15 17 5" /></Svg>
  return <Svg><path d="M3 15c5 0 3-10 14-10" /></Svg>
}

/** The line is always drawn the same way; only the cap changes. */
function ArrowheadGlyph({ value, atStart }: { value: string | undefined; atStart?: boolean }) {
  const tip = atStart ? 4 : 16
  const away = atStart ? 1 : -1
  const caps: Record<string, ReactElement | null> = {
    none: null,
    arrow: <path d={`M${tip} 10l${4 * away} -3.4M${tip} 10l${4 * away} 3.4`} />,
    triangle: <path d={`M${tip} 10l${5 * away} -3.4v6.8z`} data-role="solid" />,
    inverted: <path d={`M${tip + 5 * away} 10l${-5 * away} -3.4v6.8z`} data-role="solid" />,
    square: <rect x={tip - (atStart ? 0 : 4)} y="7" width="4" height="6" data-role="solid" />,
    dot: <circle cx={tip + 2 * away} cy="10" r="2.6" data-role="solid" />,
    diamond: <path d={`M${tip} 10l${3 * away} -3l${3 * away} 3l${-3 * away} 3z`} data-role="solid" />,
    pipe: <path d={`M${tip} 6.5v7`} />,
    bar: <path d={`M${tip} 6.5v7`} />,
  }
  return (
    <Svg>
      <path d={atStart ? 'M6 10h11' : 'M3 10h11'} />
      {caps[value ?? 'none']}
    </Svg>
  )
}
