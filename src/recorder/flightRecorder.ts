import {
  reverseRecordsDiff,
  type Editor,
  type HistoryEntry,
  type RecordsDiff,
  type TLEventInfo,
  type TLRecord,
  type TLStoreSnapshot,
} from 'tldraw'

/**
 * The in-page half of the flight recorder.
 *
 * It listens to tldraw through its public seams only — `editor.on('event')`,
 * `store.listen`, `getPath()`, `menus.getOpenMenus()` — and to the window for
 * the keys and clicks tldraw never sees (a menu or a text field swallows the
 * key-down before the editor's document handler runs). Everything lands as
 * one row per fact on ONE clock, `performance.now()` since the recorder
 * started, in a ring buffer that keeps only the last `windowMs`. "Save the
 * last 30 s" hands that buffer over; "Record next ≤ 30 s" marks a start inside
 * it. Nothing here writes to disk or talks to the host; see `recorderStore`.
 *
 * Measured in the spike that preceded this module: 2.1 ms of listener time
 * over an 8.4 s Block interaction (0.03 %), so it is safe to leave armed.
 */

export type RecorderLane = 'input' | 'state' | 'menu' | 'store' | 'console' | 'dom' | 'mark'
export type RecorderMode = 'last' | 'take'

export interface RecorderRow {
  /** Milliseconds since the recorder started (rebased to the window on save). */
  t: number
  lane: RecorderLane
  [key: string]: unknown
}

export interface RecorderHeader {
  mode: RecorderMode
  startedAt: string
  endedAt: string
  startedAtWall: number
  endedAtWall: number
  durationMs: number
  windowMs: number
  note: string
  url: string
  userAgent: string
  devicePixelRatio: number
  viewport: { w: number; h: number }
  screenBounds: unknown
  camera: unknown
  pageId: string
  shapeCount: number
  pathAtStart: string
  pathAtEnd: string
  selectedAtStart: string[]
  selectedAtEnd: string[]
  recorderUptimeMs: number
  recorderCostMs: number
  rowsDropped: number
}

export interface RecordingPayload {
  header: RecorderHeader
  rows: RecorderRow[]
  startSnapshot: TLStoreSnapshot
  endSnapshot: TLStoreSnapshot
}

export interface FlightRecorderOptions {
  windowMs?: number
  /** Injected clocks so the window logic can be unit-tested. */
  now?: () => number
  wallNow?: () => number
  /** A DOM to listen on for the `dom` lane; omit to skip that lane. */
  domTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'> | null
}

export const DEFAULT_WINDOW_MS = 30_000
export const MIN_WINDOW_MS = 5_000
export const MAX_WINDOW_MS = 120_000
export const WINDOW_CHOICES_MS = [5_000, 15_000, 30_000, 60_000, 120_000] as const

const CONSOLE_LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const
type ConsoleLevel = (typeof CONSOLE_LEVELS)[number]

export function clampWindowMs(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_WINDOW_MS
  return Math.min(MAX_WINDOW_MS, Math.max(MIN_WINDOW_MS, Math.round(value)))
}

/** Drop everything older than `cutoff` from the front of a time-ordered list. */
export function trimBefore<T extends { t: number }>(items: T[], cutoff: number): number {
  let dropped = 0
  while (items.length && items[0].t < cutoff) {
    items.shift()
    dropped += 1
  }
  return dropped
}

interface StoreOp {
  op: 'add' | 'update' | 'remove'
  id: string
  type: string
  delta?: Record<string, unknown>
}

/** A readable summary of a store diff: what changed, by record and by key. */
export function summariseDiff(changes: RecordsDiff<TLRecord>): StoreOp[] {
  const ops: StoreOp[] = []
  for (const record of Object.values(changes.added)) {
    ops.push({ op: 'add', id: record.id, type: recordType(record) })
  }
  for (const record of Object.values(changes.removed)) {
    ops.push({ op: 'remove', id: record.id, type: recordType(record) })
  }
  for (const [before, after] of Object.values(changes.updated)) {
    if (after.typeName === 'pointer') continue // 60 Hz duplicate of the input lane
    const delta: Record<string, unknown> = {}
    let changed = 0
    for (const key of Object.keys(after) as (keyof typeof after)[]) {
      const next = JSON.stringify(after[key])
      if (next === JSON.stringify(before[key])) continue
      changed += 1
      delta[key as string] = next.length <= 160 ? after[key] : `<${next.length} chars>`
    }
    if (changed === 0) continue
    ops.push({ op: 'update', id: after.id, type: recordType(after), delta })
  }
  return ops
}

function recordType(record: TLRecord): string {
  return 'type' in record && typeof record.type === 'string' ? record.type : record.typeName
}

/**
 * Walk a store snapshot BACK through a list of diffs, newest first, to the
 * state at the window's tail. This is what makes a retroactive save replayable:
 * `startSnapshot` + the store lane reproduces every instant in the window.
 */
export function rewindSnapshot(end: TLStoreSnapshot, diffs: RecordsDiff<TLRecord>[]): TLStoreSnapshot {
  const store: Record<string, TLRecord> = { ...(end.store as Record<string, TLRecord>) }
  for (let index = diffs.length - 1; index >= 0; index -= 1) {
    const reversed = reverseRecordsDiff(diffs[index]) as RecordsDiff<TLRecord>
    for (const id of Object.keys(reversed.removed)) delete store[id]
    for (const [id, record] of Object.entries(reversed.added)) store[id] = record
    for (const [id, [, after]] of Object.entries(reversed.updated)) store[id] = after
  }
  return { ...end, store: store as TLStoreSnapshot['store'] }
}

function compactEvent(editor: Editor, info: TLEventInfo): Record<string, unknown> {
  const out: Record<string, unknown> = { name: info.name, type: info.type }
  if ('point' in info && info.point) out.screen = [Math.round(info.point.x), Math.round(info.point.y)]
  if (info.name.startsWith('pointer')) {
    const page = editor.inputs.currentPagePoint
    out.page = [Math.round(page.x), Math.round(page.y)]
  }
  if ('target' in info && info.target) out.target = info.target
  if ('shape' in info && info.shape) out.shape = { id: info.shape.id, type: info.shape.type }
  if ('handle' in info && info.handle) out.handle = typeof info.handle === 'string' ? info.handle : info.handle.id
  if ('button' in info && typeof info.button === 'number') out.button = info.button
  if ('key' in info && info.key) out.key = info.key
  if ('code' in info && info.code) out.code = info.code
  const flags = info as unknown as Record<string, unknown>
  const mods = (['shiftKey', 'altKey', 'ctrlKey', 'metaKey'] as const).filter((key) => flags[key] === true)
  if (mods.length) out.mods = mods
  if ('isPen' in info && info.isPen) out.pen = true
  return out
}

/** Which UI element a DOM event landed on, in the terms a person would use. */
export function describeDomTarget(target: EventTarget | null): string {
  if (!(target instanceof Element)) return String(target?.constructor?.name ?? 'window')
  const labelled = target.closest('[aria-label],[data-testid],button,[role="menuitem"],input,textarea,[contenteditable="true"]') ?? target
  const tag = labelled.tagName.toLowerCase()
  const label = labelled.getAttribute('aria-label') ?? labelled.getAttribute('data-testid') ?? labelled.getAttribute('title')
  const role = labelled.getAttribute('role')
  const text = tag === 'button' || role === 'menuitem' ? (labelled.textContent ?? '').trim().slice(0, 32) : ''
  const name = label ?? text
  return name ? `${tag}${role ? `[${role}]` : ''} “${name}”` : `${tag}${role ? `[${role}]` : ''}`
}

export class FlightRecorder {
  readonly windowMs: number
  private readonly editor: Editor
  private readonly now: () => number
  private readonly wallNow: () => number
  private readonly domTarget: FlightRecorderOptions['domTarget']
  private rows: RecorderRow[] = []
  private diffs: { t: number; changes: RecordsDiff<TLRecord> }[] = []
  private t0 = 0
  private wall0 = 0
  private costMs = 0
  private dropped = 0
  private lastPath = ''
  private lastMenus = ''
  private take: { t: number; wall: number; snapshot: TLStoreSnapshot; path: string; selected: string[] } | null = null
  private disposers: (() => void)[] = []
  private originalConsole: Partial<Record<ConsoleLevel, (...args: unknown[]) => void>> = {}
  running = false

  constructor(editor: Editor, options: FlightRecorderOptions = {}) {
    this.editor = editor
    this.windowMs = clampWindowMs(options.windowMs ?? DEFAULT_WINDOW_MS)
    this.now = options.now ?? (() => performance.now())
    this.wallNow = options.wallNow ?? (() => Date.now())
    this.domTarget = options.domTarget === undefined ? (typeof window === 'undefined' ? null : window) : options.domTarget
  }

  /** Milliseconds since start; the recorder's clock. */
  elapsed(): number {
    return this.now() - this.t0
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.t0 = this.now()
    this.wall0 = this.wallNow()
    this.rows = []
    this.diffs = []
    this.costMs = 0
    this.dropped = 0
    this.lastPath = this.editor.getPath()
    this.lastMenus = this.editor.menus.getOpenMenus().join(',')

    const onEvent = this.timed((info: TLEventInfo) => {
      if (info.name === 'tick') return
      this.push('input', compactEvent(this.editor, info))
      this.checkDerived(info.name)
    })
    this.editor.on('event', onEvent)
    this.disposers.push(() => this.editor.off('event', onEvent))

    const onCrash = ({ error }: { error: unknown }) => {
      this.push('console', { level: 'error', args: [`editor crash: ${String(error)}`] })
    }
    this.editor.on('crash', onCrash)
    this.disposers.push(() => this.editor.off('crash', onCrash))

    this.disposers.push(
      this.editor.store.listen(
        this.timed((entry: HistoryEntry<TLRecord>) => {
          const ops = summariseDiff(entry.changes)
          if (ops.length) {
            const t = this.push('store', { source: entry.source, ops })
            this.diffs.push({ t, changes: entry.changes })
          }
          this.checkDerived('store')
        }),
        { scope: 'all', source: 'all' },
      ),
    )

    for (const level of CONSOLE_LEVELS) {
      const original = console[level] as (...args: unknown[]) => void
      this.originalConsole[level] = original
      console[level] = (...args: unknown[]) => {
        try {
          this.push('console', { level, args: args.slice(0, 8).map(stringifyArgument) })
        } catch {
          // Recording a console line must never break the console.
        }
        original.apply(console, args)
      }
    }
    this.disposers.push(() => {
      for (const level of CONSOLE_LEVELS) {
        const original = this.originalConsole[level]
        if (original) console[level] = original as typeof console.log
      }
    })

    if (this.domTarget) {
      const dom = this.domTarget
      const onError = (event: Event) => {
        const detail = event instanceof ErrorEvent
          ? event.message
          : 'reason' in event ? String((event as PromiseRejectionEvent).reason) : event.type
        this.push('console', { level: 'error', args: [detail], uncaught: true })
      }
      const onKey = this.timed((event: Event) => {
        const key = event as KeyboardEvent
        this.push('dom', {
          event: event.type,
          key: key.key,
          code: key.code,
          on: describeDomTarget(event.target),
          mods: (['shiftKey', 'altKey', 'ctrlKey', 'metaKey'] as const).filter((name) => key[name]),
        })
      })
      const onPointer = this.timed((event: Event) => {
        const pointer = event as PointerEvent
        this.push('dom', {
          event: event.type,
          button: pointer.button,
          screen: [Math.round(pointer.clientX), Math.round(pointer.clientY)],
          on: describeDomTarget(event.target),
        })
      })
      dom.addEventListener('error', onError)
      dom.addEventListener('unhandledrejection', onError)
      dom.addEventListener('keydown', onKey, true)
      dom.addEventListener('keyup', onKey, true)
      dom.addEventListener('pointerdown', onPointer, true)
      this.disposers.push(() => {
        dom.removeEventListener('error', onError)
        dom.removeEventListener('unhandledrejection', onError)
        dom.removeEventListener('keydown', onKey, true)
        dom.removeEventListener('keyup', onKey, true)
        dom.removeEventListener('pointerdown', onPointer, true)
      })
    }
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    for (const dispose of this.disposers.splice(0)) dispose()
    this.take = null
  }

  mark(text: string): void {
    if (!this.running) return
    this.push('mark', { text })
  }

  /** Begin an explicit take: the window now starts here rather than N s ago. */
  beginTake(): void {
    if (!this.running) return
    this.take = {
      t: this.elapsed(),
      wall: this.wallNow(),
      snapshot: this.editor.store.getStoreSnapshot('all'),
      path: this.editor.getPath(),
      selected: this.editor.getSelectedShapeIds() as string[],
    }
    this.push('mark', { text: 'take started' })
  }

  get takeStartedAtWall(): number | null {
    return this.take?.wall ?? null
  }

  get isTaking(): boolean {
    return this.take !== null
  }

  /** Assemble what the host will write. Ends a take if one is running. */
  collect(mode: RecorderMode, note = ''): RecordingPayload {
    if (!this.running) throw new Error('the recorder is not running')
    this.trim()
    const endT = this.elapsed()
    const endWall = this.wallNow()
    const endSnapshot = this.editor.store.getStoreSnapshot('all')
    const take = mode === 'take' ? this.take : null
    const startT = take ? take.t : Math.max(0, endT - this.windowMs)
    const startWall = take ? take.wall : endWall - (endT - startT)
    const rows: RecorderRow[] = this.rows
      .filter((row) => row.t >= startT)
      .map((row) => ({ ...row, t: +(row.t - startT).toFixed(1) }))
    const diffsInWindow = this.diffs.filter((diff) => diff.t >= startT).map((diff) => diff.changes)
    const startSnapshot = take ? take.snapshot : rewindSnapshot(endSnapshot, diffsInWindow)
    const firstState = rows.find((row) => row.lane === 'state')
    const editor = this.editor
    const instance = editor.getInstanceState()
    const header: RecorderHeader = {
      mode,
      startedAt: new Date(startWall).toISOString(),
      endedAt: new Date(endWall).toISOString(),
      startedAtWall: startWall,
      endedAtWall: endWall,
      durationMs: +(endT - startT).toFixed(1),
      windowMs: this.windowMs,
      note,
      url: typeof location === 'undefined' ? '' : location.href,
      userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
      devicePixelRatio: typeof devicePixelRatio === 'undefined' ? 1 : devicePixelRatio,
      viewport: typeof innerWidth === 'undefined' ? { w: 0, h: 0 } : { w: innerWidth, h: innerHeight },
      screenBounds: instance.screenBounds,
      camera: editor.getCamera(),
      pageId: editor.getCurrentPageId(),
      shapeCount: editor.getCurrentPageShapeIds().size,
      pathAtStart: take ? take.path : typeof firstState?.from === 'string' ? firstState.from : editor.getPath(),
      pathAtEnd: editor.getPath(),
      selectedAtStart: take ? take.selected : [],
      selectedAtEnd: editor.getSelectedShapeIds() as string[],
      recorderUptimeMs: +endT.toFixed(1),
      recorderCostMs: +this.costMs.toFixed(1),
      rowsDropped: this.dropped,
    }
    this.take = null
    return { header, rows, startSnapshot, endSnapshot }
  }

  /** Everything currently buffered, for tests and the indicator. */
  size(): { rows: number; diffs: number } {
    return { rows: this.rows.length, diffs: this.diffs.length }
  }

  private push(lane: RecorderLane, data: Record<string, unknown>): number {
    const t = +this.elapsed().toFixed(1)
    this.rows.push({ t, lane, ...data })
    if (this.rows.length % 64 === 0) this.trim()
    return t
  }

  private trim(): void {
    // A take must keep its own start even when it is older than the window;
    // the UI caps a take at the window so this only matters at the boundary.
    const cutoff = Math.min(this.elapsed() - this.windowMs, this.take?.t ?? Number.POSITIVE_INFINITY)
    this.dropped += trimBefore(this.rows, cutoff)
    trimBefore(this.diffs, cutoff)
  }

  private checkDerived(trigger: string): void {
    const path = this.editor.getPath()
    if (path !== this.lastPath) {
      this.push('state', { from: this.lastPath, to: path, trigger })
      this.lastPath = path
    }
    const menus = this.editor.menus.getOpenMenus().join(',')
    if (menus !== this.lastMenus) {
      this.push('menu', { open: menus ? menus.split(',') : [], trigger })
      this.lastMenus = menus
    }
  }

  private timed<T extends unknown[]>(fn: (...args: T) => void): (...args: T) => void {
    return (...args: T) => {
      const started = this.now()
      try {
        fn(...args)
      } finally {
        this.costMs += this.now() - started
      }
    }
  }
}

function stringifyArgument(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return `${value.name}: ${value.message}`
  try {
    const text = JSON.stringify(value)
    return text === undefined ? String(value) : text.length > 400 ? `${text.slice(0, 399)}…` : text
  } catch {
    return String(value)
  }
}
