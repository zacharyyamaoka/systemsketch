import {
  TldrawUiDialogBody,
  TldrawUiDialogCloseButton,
  TldrawUiDialogHeader,
  TldrawUiDialogTitle,
  type TLUiDialogProps,
} from 'tldraw'
import { Settings } from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentProps,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import {
  DEFAULT_INTERFACE_SCALE,
  INTERFACE_SCALE_PRESETS,
  INTERFACE_SCALE_STEP,
  MAX_INTERFACE_SCALE,
  MIN_INTERFACE_SCALE,
  updateInterfaceScale,
  useInterfaceScale,
} from './interfaceScale'
import {
  sameChoice,
  SYSTEMSKETCH_SWATCHES,
  themeOptions,
  type SwatchTokens,
  type ThemeOption,
  type ThemePalette,
} from '../theme/themeModel'
import { BUILT_IN_PALETTES } from '../theme/palettes'
import {
  addImportedPalette,
  removeImportedPalette,
  updateThemeChoice,
  useImportedPalettes,
  useThemeChoice,
} from '../theme/themeStore'
import { paletteFromVsCodeTheme, parseVsCodeThemeText, slugify } from '../theme/vscodeTheme'
import {
  DEFAULT_WHEEL_ZOOM_SENSITIVITY_PERCENT,
  MAX_WHEEL_ZOOM_SENSITIVITY_PERCENT,
  MIN_WHEEL_ZOOM_SENSITIVITY_PERCENT,
  updateAppearancePreferences,
  useAppearancePreferences,
  WHEEL_ZOOM_SENSITIVITY_STEP,
} from './appearancePreferences'
import { TOOL_SEARCH_ALIAS_ITEMS, type ToolSearchAliasItem } from '../library/toolSearchCatalog'
import {
  addToolAlias,
  normalizeToolAlias,
  removeToolAlias,
  useToolAliases,
} from '../library/toolAliases'
import { MenuLabPanel } from '../prototypes/menuLab/ContextualMenuLab'
import { readFileAccessSettings, writeFileAccessSettings } from '../workspace/workspaceClient'
import {
  applyEdgePolicyPreset,
  EDGE_POLICY_PRESETS,
  EDGE_POLICY_RULE_COUNT,
  edgePolicyPreset,
  enforcedRuleCount,
  matchingEdgePolicyPreset,
  TYPE_MATCHING_MODES,
  updateEdgePolicy,
  useEdgePolicy,
  type EdgePolicyBooleanKey,
  type TypeMatching,
} from './edgePolicy'
import './interface-settings.css'

export function SettingsGearIcon(props: ComponentProps<'svg'>) {
  return <Settings aria-hidden="true" {...props} />
}

function CategoryIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      {children}
    </svg>
  )
}

type SettingsCategoryId = 'general' | 'canvas' | 'connections' | 'appearance' | 'interface' | 'shortcuts' | 'menu-lab' | 'about'

const SETTINGS_CATEGORIES: readonly { id: SettingsCategoryId; label: string; icon: ReactNode }[] = [
  {
    id: 'general',
    label: 'General',
    icon: <CategoryIcon><path d="M4 5.5h12M4 10h12M4 14.5h12" /><circle cx="7" cy="5.5" r="1.4" /><circle cx="13" cy="10" r="1.4" /><circle cx="8.5" cy="14.5" r="1.4" /></CategoryIcon>,
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: <CategoryIcon><circle cx="10" cy="10" r="6.5" /><path d="M10 3.5a6.5 6.5 0 0 0 0 13Z" /></CategoryIcon>,
  },
  {
    id: 'canvas',
    label: 'Canvas',
    icon: <CategoryIcon><circle cx="10" cy="10" r="5.8" /><path d="M10 1.8v3M10 15.2v3M1.8 10h3M15.2 10h3" /></CategoryIcon>,
  },
  {
    id: 'connections',
    label: 'Connections',
    // Two ports and the cable between them — the thing the panel governs.
    icon: <CategoryIcon><circle cx="4.6" cy="10" r="2.1" /><circle cx="15.4" cy="10" r="2.1" /><path d="M6.7 10h6.6" /></CategoryIcon>,
  },
  {
    id: 'interface',
    label: 'Interface',
    icon: <CategoryIcon><rect x="3.5" y="4" width="13" height="12" rx="2" /><path d="M3.5 7.5h13M7.5 7.5V16" /></CategoryIcon>,
  },
  {
    id: 'shortcuts',
    label: 'Tool aliases',
    icon: <CategoryIcon><rect x="3" y="5" width="14" height="10" rx="2" /><path d="M6 8h.01M9 8h.01M12 8h.01M15 8h.01M6 11h.01M9 11h.01M12 11h3M7 13h6" /></CategoryIcon>,
  },
  {
    id: 'menu-lab',
    label: 'Menu lab',
    // Three sliders: the levers themselves, which is what this section is.
    icon: <CategoryIcon><path d="M4 6h5M13 6h3M4 10h9M17 10h-1M4 14h3M11 14h5" /><circle cx="11" cy="6" r="1.6" /><circle cx="15" cy="10" r="1.6" /><circle cx="9" cy="14" r="1.6" /></CategoryIcon>,
  },
  {
    id: 'about',
    label: 'About',
    icon: <CategoryIcon><circle cx="10" cy="10" r="6.5" /><path d="M10 9v4M10 6.7h.01" /></CategoryIcon>,
  },
]

const OPEN_CATEGORIES: readonly SettingsCategoryId[] = ['general', 'appearance', 'canvas', 'connections', 'interface', 'shortcuts', 'menu-lab']

/** The category the dialog opens on; a caller may ask for another. */
export interface SystemSketchSettingsDialogProps extends TLUiDialogProps {
  category?: SettingsCategoryId
}

export function SystemSketchSettingsDialog({ category: initial }: SystemSketchSettingsDialogProps) {
  const [category, setCategory] = useState<SettingsCategoryId>(initial ?? 'interface')

  return (
    <div className="systemsketch-settings" data-testid="systemsketch-settings-dialog" data-category={category}>
      <TldrawUiDialogHeader className="systemsketch-settings__header">
        <SettingsGearIcon className="systemsketch-settings__title-icon" />
        <TldrawUiDialogTitle>Settings</TldrawUiDialogTitle>
        <TldrawUiDialogCloseButton />
      </TldrawUiDialogHeader>
      <TldrawUiDialogBody className="systemsketch-settings__body">
        <nav className="systemsketch-settings__nav" aria-label="Settings categories">
          {SETTINGS_CATEGORIES.map((item) => {
            const open = OPEN_CATEGORIES.includes(item.id)
            const active = item.id === category
            return (
              <button
                key={item.id}
                type="button"
                className={active ? 'is-active' : undefined}
                aria-current={active ? 'page' : undefined}
                /* `aria-disabled` rather than `disabled`: a `disabled` button
                   is unfocusable, and most browsers never render its `title`
                   — so the only explanation for why the row is dead was
                   invisible to a pointer and silent to a screen reader. It
                   stays reachable and stays inert; the click is refused
                   below. */
                aria-disabled={!open || undefined}
                data-disabled={!open || undefined}
                title={open ? undefined : `${item.label} settings are coming later`}
                data-testid={`systemsketch-settings-category-${item.id}`}
                onClick={() => { if (open) setCategory(item.id) }}
              >
                {item.icon}
                <span>{item.label}</span>
                {open ? null : <em>Later</em>}
              </button>
            )
          })}
        </nav>
        {category === 'general'
          ? <GeneralPanel />
          : category === 'appearance'
          ? <AppearancePanel />
          : category === 'canvas'
          ? <CanvasPanel />
          : category === 'connections'
          ? <ConnectionsPanel />
          : category === 'shortcuts'
          ? <ToolAliasesPanel />
          : category === 'menu-lab'
          ? <MenuLabSettingsPanel />
          : <InterfacePanel />}
      </TldrawUiDialogBody>
    </div>
  )
}

function ToolAliasRow({ item }: { item: ToolSearchAliasItem }) {
  const aliases = useToolAliases()
  const [draft, setDraft] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const itemAliases = aliases[item.id] ?? []

  const add = () => {
    const normalized = normalizeToolAlias(draft)
    if (!normalized) {
      setMessage('Enter a name up to 64 characters.')
      return
    }
    if (!addToolAlias(item.id, normalized)) {
      setMessage(`${normalized} is already an alias for ${item.label}.`)
      return
    }
    setDraft('')
    setMessage(null)
  }

  return (
    <article className="systemsketch-tool-alias-row" data-testid={`systemsketch-tool-alias-row-${item.id}`}>
      <header>
        <div>
          <h3>{item.label}</h3>
          <p>{item.detail}</p>
        </div>
      </header>
      <div className="systemsketch-tool-alias-row__aliases" aria-label={`Aliases for ${item.label}`}>
        {itemAliases.length > 0 ? itemAliases.map((alias) => (
          <span key={alias} className="systemsketch-tool-alias-chip">
            <span aria-hidden="true">↪</span>{alias}
            <button
              type="button"
              aria-label={`Remove ${alias} from ${item.label}`}
              data-testid={`systemsketch-tool-alias-remove-${item.id}-${alias}`}
              onClick={() => removeToolAlias(item.id, alias)}
            >×</button>
          </span>
        )) : <span className="systemsketch-tool-alias-row__empty">No custom aliases</span>}
      </div>
      <form
        className="systemsketch-tool-alias-row__add"
        onSubmit={(event) => {
          event.preventDefault()
          add()
        }}
      >
        <label className="systemsketch-settings__visually-hidden" htmlFor={`systemsketch-tool-alias-${item.id}`}>
          Add an alias for {item.label}
        </label>
        <input
          id={`systemsketch-tool-alias-${item.id}`}
          data-testid={`systemsketch-tool-alias-input-${item.id}`}
          value={draft}
          placeholder="Add an alias, e.g. @datatype"
          maxLength={64}
          onChange={(event) => {
            setDraft(event.currentTarget.value)
            setMessage(null)
          }}
        />
        <button type="submit" data-testid={`systemsketch-tool-alias-add-${item.id}`} disabled={!draft.trim()}>Add</button>
      </form>
      {message ? <p className="systemsketch-tool-alias-row__message" role="status">{message}</p> : null}
    </article>
  )
}

function ToolAliasesPanel() {
  return (
    <section className="systemsketch-settings__panel" aria-labelledby="tool-aliases-title" data-testid="systemsketch-tool-aliases-panel">
      <div className="systemsketch-settings__eyebrow">Tools</div>
      <div className="systemsketch-settings__intro">
        <div>
          <h2 id="tool-aliases-title">Tool aliases</h2>
          <p>Give any S-search tool the names you use. An alias like <code>@datatype</code> opens Text without changing the tool’s canonical name.</p>
        </div>
      </div>
      <div className="systemsketch-tool-alias-list">
        {TOOL_SEARCH_ALIAS_ITEMS.map((item) => <ToolAliasRow key={item.id} item={item} />)}
      </div>
      <div className="systemsketch-settings__note">
        <span className="systemsketch-settings__saved-dot" aria-hidden="true" />
        <div>
          <strong>Saved on this computer</strong>
          <p>Aliases enrich S search and the Shapes library. They are personal vocabulary, not board content.</p>
        </div>
      </div>
    </section>
  )
}

/**
 * Off by default. Enabling this defeats the fence in workspace_store.py that
 * confines every board open/save/rename/reveal to the configured workspace
 * root — the same fence a hostile web page would need to escape, so the
 * toggle is explained rather than buried, and persisted on the local
 * SystemSketch server (not this browser) since Stable and Preview both
 * enforce it independently and both need to see the same choice immediately.
 */
function GeneralPanel() {
  const [allowAnyPath, setAllowAnyPath] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    readFileAccessSettings()
      .then((settings) => {
        if (cancelled) return
        setAllowAnyPath(settings.allowAnyPath)
        setLoaded(true)
      })
      .catch((cause) => {
        if (cancelled) return
        setMessage(cause instanceof Error ? cause.message : String(cause))
        setLoaded(true)
      })
    return () => { cancelled = true }
  }, [])

  const toggle = () => {
    const next = !allowAnyPath
    setPending(true)
    setAllowAnyPath(next)
    writeFileAccessSettings(next)
      .then((settings) => {
        setAllowAnyPath(settings.allowAnyPath)
        setMessage(null)
      })
      .catch((cause) => {
        setAllowAnyPath(!next)
        setMessage(cause instanceof Error ? cause.message : String(cause))
      })
      .finally(() => setPending(false))
  }

  return (
    <section className="systemsketch-settings__panel" aria-labelledby="file-access-title" data-testid="systemsketch-general-panel">
      <div className="systemsketch-settings__eyebrow">General</div>
      <div className="systemsketch-settings__intro">
        <div>
          <h2 id="file-access-title">File access</h2>
          <p>SystemSketch normally only opens, saves, and browses boards inside your workspace folder.</p>
        </div>
      </div>

      <section className="systemsketch-settings__appearance-section" aria-labelledby="allow-any-path-title">
        <div className="systemsketch-settings__appearance-heading">
          <h3 id="allow-any-path-title">Allow opening files anywhere</h3>
          <p>
            Lets a board link (<code>?board=</code>), Save As, or Rename reach any path on this
            computer — not just your workspace folder. Turn this on only if you need to open a
            board from somewhere else, like an agent worktree; leave it off otherwise.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          className="systemsketch-settings__toggle-row"
          aria-checked={allowAnyPath}
          disabled={!loaded || pending}
          data-testid="systemsketch-allow-any-path"
          onClick={toggle}
        >
          <span>
            <strong>Allow opening files anywhere</strong>
            <small>Off by default. Takes effect immediately, in both Stable and Preview.</small>
          </span>
          <i aria-hidden="true"><span /></i>
        </button>
        {message ? (
          <p className="systemsketch-settings__message is-error" role="alert" data-testid="systemsketch-allow-any-path-message">
            {message}
          </p>
        ) : null}
      </section>

      <div className="systemsketch-settings__note">
        <span className="systemsketch-settings__saved-dot" aria-hidden="true" />
        <div>
          <strong>Saved by the local SystemSketch server</strong>
          <p>This changes what the local SystemSketch server itself will read or write — it is not part of any board file.</p>
        </div>
      </div>
    </section>
  )
}

/**
 * Settings → Menu lab. The lever board, in the dialog.
 *
 * WHY the real board rather than a link out to `?menu-lab`: the dialog is
 * already inside the app's editor and UI context, so the embedded panel gets
 * the live theme, tldraw's own popover, and the SAME registry, binder and
 * renderer the appearance pill uses. A lab that ran somewhere else would
 * gradually stop reproducing the bugs it exists to reproduce. The standalone
 * route stays for driving it without an app around it.
 */
function MenuLabSettingsPanel() {
  return (
    <section className="systemsketch-settings__panel" aria-labelledby="menu-lab-title">
      <div className="systemsketch-settings__eyebrow">Menu lab</div>
      <div className="systemsketch-settings__intro">
        <div>
          <h2 id="menu-lab-title">Menu lab</h2>
          <p>
            Compose a contextual menu out of its levers and watch the real menu
            recompose. Every SystemSketch menu — the selection pill, a
            connector&rsquo;s row, a Block title&rsquo;s formatting — is one
            registry projected through settings like these.
          </p>
        </div>
      </div>
      <div className="menu-lab__container">
        <MenuLabPanel />
      </div>
    </section>
  )
}

/* ------------------------------- connections ------------------------------- */

/**
 * One permission, phrased as what it LETS you draw. The switch being on always
 * means "more is possible", so the whiteboard end of the ladder is the row of
 * every switch on, and nobody has to work out whether a checked box tightens or
 * loosens the board.
 */
function PolicyToggle({
  id,
  title,
  detail,
  refuses,
  value,
  onChange,
}: {
  id: EdgePolicyBooleanKey
  title: string
  detail: string
  /** The concrete thing that stops being drawable when this is off. */
  refuses: string
  value: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      className="systemsketch-settings__toggle-row"
      aria-checked={value}
      data-testid={`systemsketch-edge-policy-${id}`}
      onClick={() => onChange(!value)}
    >
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
        <small className="systemsketch-edge-policy__refuses">
          {value ? 'Allowed' : <>Refused: <code>{refuses}</code></>}
        </small>
      </span>
      <i aria-hidden="true"><span /></i>
    </button>
  )
}

const TYPE_MATCHING_LABELS: Readonly<Record<TypeMatching, { label: string; detail: string }>> = {
  off: { label: 'Off', detail: 'Types are documentation. Any port may meet any other.' },
  lenient: { label: 'Lenient', detail: 'Declared types must agree. A port with no type is a wildcard.' },
  strict: { label: 'Strict', detail: 'Both ends must declare a type, and the two must agree.' },
}

/**
 * The whole spectrum in one place: a plain whiteboard where a cable means
 * whatever you meant, through to a board that can only be drawn correct.
 *
 * WHY presets sit ABOVE the toggles rather than replacing them: a preset is a
 * shortcut into the same nine switches, never a second source of truth, so the
 * chosen preset is DERIVED by matching the live policy — flip one switch and
 * the row honestly reads Custom instead of lying about which preset is on.
 */
function ConnectionsPanel() {
  const policy = useEdgePolicy()
  const preset = matchingEdgePolicyPreset(policy)
  const enforced = enforcedRuleCount(policy)

  return (
    <section
      className="systemsketch-settings__panel"
      aria-labelledby="edge-policy-title"
      data-testid="systemsketch-connections-panel"
      data-preset={preset ?? 'custom'}
      data-enforced={enforced}
    >
      <div className="systemsketch-settings__eyebrow">Connections</div>
      <div className="systemsketch-settings__intro">
        <div>
          <h2 id="edge-policy-title">Edge creation policy</h2>
          <p>
            What SystemSketch will let you wire. Slide it all the way down for a plain whiteboard —
            any port to any port — or all the way up so only edges that could exist in the running
            program can be drawn at all.
          </p>
        </div>
        <output
          className="systemsketch-edge-policy__count"
          data-testid="systemsketch-edge-policy-count"
          aria-label={`Enforcing ${enforced} of ${EDGE_POLICY_RULE_COUNT} rules`}
        >
          {enforced}<span>/{EDGE_POLICY_RULE_COUNT}</span>
        </output>
      </div>

      <div
        className="systemsketch-settings__presets systemsketch-edge-policy__presets"
        aria-label="Edge policy presets"
      >
        {EDGE_POLICY_PRESETS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === preset ? 'is-active' : undefined}
            aria-pressed={item.id === preset}
            title={item.summary}
            data-testid={`systemsketch-edge-preset-${item.id}`}
            onClick={() => applyEdgePolicyPreset(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="systemsketch-edge-policy__summary" data-testid="systemsketch-edge-policy-summary">
        {preset
          ? edgePolicyPreset(preset).summary
          : 'Custom — these rules do not match a preset. Pick one above to start over.'}
      </p>

      <section className="systemsketch-settings__appearance-section" aria-labelledby="edge-direction-title">
        <div className="systemsketch-settings__appearance-heading">
          <h3 id="edge-direction-title">Direction</h3>
          <p>Which way data is allowed to run, and whether it may come back around.</p>
        </div>
        <PolicyToggle
          id="allowSamePolarity"
          title="Wire two outputs, or two inputs"
          detail="Off, a cable must join something that emits to something that receives — the arrowhead follows from the ports, not from which way you dragged."
          refuses="output → output"
          value={policy.allowSamePolarity}
          onChange={(next) => updateEdgePolicy({ allowSamePolarity: next })}
        />
        <PolicyToggle
          id="allowCycles"
          title="Close a feedback loop"
          detail="Off, a cable may not land on anything already upstream of where it started. Use a Loop region for deliberate feedback."
          refuses="A → B → A"
          value={policy.allowCycles}
          onChange={(next) => updateEdgePolicy({ allowCycles: next })}
        />
        <PolicyToggle
          id="allowSelfConnection"
          title="Wire a Block to itself"
          detail="A cable that leaves a Block's outlet and turns straight back into its own inlet."
          refuses="A → A"
          value={policy.allowSelfConnection}
          onChange={(next) => updateEdgePolicy({ allowSelfConnection: next })}
        />
      </section>

      <section className="systemsketch-settings__appearance-section" aria-labelledby="edge-boundaries-title">
        <div className="systemsketch-settings__appearance-heading">
          <h3 id="edge-boundaries-title">Boundaries</h3>
          <p>Whether a Block is a black box — reachable only through the ports it shows you.</p>
        </div>
        <PolicyToggle
          id="allowCrossBoundary"
          title="Wire straight through a Block's wall"
          detail="Off, a Block inside a box can only reach the outside through that box's own ports, so the picture on screen is the whole contract. On, any dot reaches any other and the cable takes the nearest frame that holds both ends."
          refuses="child of A → sibling of A"
          value={policy.allowCrossBoundary}
          onChange={(next) => updateEdgePolicy({ allowCrossBoundary: next })}
        />
        <PolicyToggle
          id="allowHiddenPorts"
          title="Wire a hidden port"
          detail="A port hidden in the current view keeps its identity and its anchor, but is normally not a landing target."
          refuses="a port you cannot see"
          value={policy.allowHiddenPorts}
          onChange={(next) => updateEdgePolicy({ allowHiddenPorts: next })}
        />
      </section>

      <section className="systemsketch-settings__appearance-section" aria-labelledby="edge-types-title">
        <div className="systemsketch-settings__appearance-heading">
          <h3 id="edge-types-title">Data types</h3>
          <p>
            Ports carry free text today — <code>Pose</code>, <code>bytes</code>, or nothing. Case and
            surrounding space are ignored, and <code>any</code>, <code>object</code> and <code>*</code>
            {' '}meet anything.
          </p>
        </div>
        <div className="systemsketch-edge-policy__modes" role="radiogroup" aria-labelledby="edge-types-title">
          {TYPE_MATCHING_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={policy.typeMatching === mode}
              className={policy.typeMatching === mode ? 'is-active' : undefined}
              data-testid={`systemsketch-edge-type-matching-${mode}`}
              onClick={() => updateEdgePolicy({ typeMatching: mode })}
            >
              <strong>{TYPE_MATCHING_LABELS[mode].label}</strong>
              <small>{TYPE_MATCHING_LABELS[mode].detail}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="systemsketch-settings__appearance-section" aria-labelledby="edge-fan-title">
        <div className="systemsketch-settings__appearance-heading">
          <h3 id="edge-fan-title">How many cables meet at one port</h3>
          <p>One value read by two consumers is ordinary. Two producers writing one input is a question the picture cannot answer.</p>
        </div>
        <PolicyToggle
          id="allowFanIn"
          title="Several cables into one input"
          detail="Off, an input takes a single producer. Branch and Loop regions still choose between arms — that is not fan-in."
          refuses="A → C, B → C"
          value={policy.allowFanIn}
          onChange={(next) => updateEdgePolicy({ allowFanIn: next })}
        />
        <PolicyToggle
          id="allowFanOut"
          title="Several cables out of one output"
          detail="Off, an output feeds exactly one consumer, which forces an explicit copy or tee wherever a value is used twice."
          refuses="A → B, A → C"
          value={policy.allowFanOut}
          onChange={(next) => updateEdgePolicy({ allowFanOut: next })}
        />
        <PolicyToggle
          id="allowDuplicates"
          title="A second copy of the same cable"
          detail="Two cables joining the exact same pair of ports. There is nothing on screen that tells them apart."
          refuses="A.out → B.in, twice"
          value={policy.allowDuplicates}
          onChange={(next) => updateEdgePolicy({ allowDuplicates: next })}
        />
      </section>

      <div className="systemsketch-settings__note">
        <span className="systemsketch-settings__saved-dot" aria-hidden="true" />
        <div>
          <strong>Saved on this computer</strong>
          <p>
            This governs what you can draw from now on. Cables already on a board are never
            re-judged, so tightening the policy cannot break a board someone else authored.
          </p>
        </div>
      </div>

      <button
        type="button"
        className="systemsketch-settings__reset"
        data-testid="systemsketch-edge-policy-reset"
        disabled={preset === 'guided'}
        onClick={() => applyEdgePolicyPreset('guided')}
      >
        Reset to Guided
      </button>
    </section>
  )
}

function InterfacePanel() {
  const percent = useInterfaceScale()

  return (
    <section className="systemsketch-settings__panel" aria-labelledby="interface-scale-title">
      <div className="systemsketch-settings__eyebrow">Interface</div>
      <div className="systemsketch-settings__intro">
        <div>
          <h2 id="interface-scale-title">Interface scale</h2>
          <p>Make menus, panels, and the toolbar easier to see on high-resolution displays.</p>
        </div>
        <output aria-live="polite" htmlFor="systemsketch-interface-scale">{percent}%</output>
      </div>

      <div className="systemsketch-settings__slider-row">
        <span aria-hidden="true">A</span>
        <input
          id="systemsketch-interface-scale"
          type="range"
          min={MIN_INTERFACE_SCALE}
          max={MAX_INTERFACE_SCALE}
          step={INTERFACE_SCALE_STEP}
          value={percent}
          aria-valuetext={`${percent}%`}
          onChange={(event) => updateInterfaceScale(Number(event.currentTarget.value))}
        />
        <span className="large" aria-hidden="true">A</span>
      </div>

      <div className="systemsketch-settings__presets" aria-label="Interface scale presets">
        {INTERFACE_SCALE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={preset === percent ? 'is-active' : undefined}
            aria-pressed={preset === percent}
            onClick={() => updateInterfaceScale(preset)}
          >
            {preset}%
          </button>
        ))}
      </div>

      <div className="systemsketch-settings__note">
        <span className="systemsketch-settings__saved-dot" aria-hidden="true" />
        <div>
          <strong>Saved on this computer</strong>
          <p>This changes the app interface only. Canvas zoom and board files stay unchanged.</p>
        </div>
      </div>

      <button
        type="button"
        className="systemsketch-settings__reset"
        disabled={percent === DEFAULT_INTERFACE_SCALE}
        onClick={() => updateInterfaceScale(DEFAULT_INTERFACE_SCALE)}
      >
        Reset to 100%
      </button>
    </section>
  )
}

function CanvasPanel() {
  const {
    directWheelZoom,
    modifierWheelZoomsOppositely,
    showZoomButtons,
    scrollDownZoomsIn,
    wheelZoomSensitivityPercent,
  } = useAppearancePreferences()

  return (
    <section className="systemsketch-settings__panel" aria-labelledby="canvas-navigation-title">
      <div className="systemsketch-settings__eyebrow">Canvas</div>
      <div className="systemsketch-settings__intro">
        <div>
          <h2 id="canvas-navigation-title">Canvas navigation</h2>
          <p>Choose how the canvas responds to a wheel and how its zoom controls appear.</p>
        </div>
      </div>

      <section className="systemsketch-settings__appearance-section" aria-labelledby="wheel-behavior-title">
        <div className="systemsketch-settings__appearance-heading">
          <h3 id="wheel-behavior-title">Wheel behavior</h3>
          <p>Use normal whiteboard navigation, or make the wheel zoom directly.</p>
        </div>
        <button
          type="button"
          role="switch"
          className="systemsketch-settings__toggle-row"
          aria-checked={directWheelZoom}
          data-testid="systemsketch-direct-wheel-zoom"
          onClick={() => updateAppearancePreferences({ directWheelZoom: !directWheelZoom })}
        >
          <span>
            <strong>Direct wheel zoom</strong>
            <small>Off: scroll pans and Ctrl/Cmd + scroll zooms. On: scroll zooms directly.</small>
          </span>
          <i aria-hidden="true"><span /></i>
        </button>
      </section>

      {directWheelZoom ? <section className="systemsketch-settings__appearance-section" aria-labelledby="wheel-zoom-title">
        <div className="systemsketch-settings__appearance-heading">
          <h3 id="wheel-zoom-title">Direct wheel zoom</h3>
          <p>Choose which direction moves closer, whether Ctrl/Cmd reverses zoom, and how much each scroll step changes scale.</p>
        </div>
        <button
          type="button"
          role="switch"
          className="systemsketch-settings__toggle-row"
          aria-checked={scrollDownZoomsIn}
          data-testid="systemsketch-scroll-down-zooms-in"
          onClick={() => updateAppearancePreferences({ scrollDownZoomsIn: !scrollDownZoomsIn })}
        >
          <span>
            <strong>Scroll down to zoom in</strong>
            <small>Turn this off if you prefer scrolling up to zoom in.</small>
          </span>
          <i aria-hidden="true"><span /></i>
        </button>
        <button
          type="button"
          role="switch"
          className="systemsketch-settings__toggle-row"
          aria-checked={modifierWheelZoomsOppositely}
          data-testid="systemsketch-modifier-wheel-zooms-oppositely"
          onClick={() => updateAppearancePreferences({
            modifierWheelZoomsOppositely: !modifierWheelZoomsOppositely,
          })}
        >
          <span>
            <strong>Ctrl/Cmd + scroll zooms the opposite way</strong>
            <small>When direct zoom is on, Ctrl/Cmd + scroll zooms instead of panning and reverses the plain wheel direction.</small>
          </span>
          <i aria-hidden="true"><span /></i>
        </button>
        <div className="systemsketch-settings__sensitivity" data-testid="systemsketch-wheel-zoom-sensitivity-control">
          <div className="systemsketch-settings__sensitivity-heading">
            <label htmlFor="systemsketch-wheel-zoom-sensitivity">
              <strong>Wheel zoom sensitivity</strong>
              <small>100% matches the standard feel. The −/+ buttons keep their normal steps.</small>
            </label>
            <output htmlFor="systemsketch-wheel-zoom-sensitivity">{wheelZoomSensitivityPercent}%</output>
          </div>
          <div className="systemsketch-settings__sensitivity-slider">
            <span>Slower</span>
            <input
              id="systemsketch-wheel-zoom-sensitivity"
              data-testid="systemsketch-wheel-zoom-sensitivity"
              type="range"
              min={MIN_WHEEL_ZOOM_SENSITIVITY_PERCENT}
              max={MAX_WHEEL_ZOOM_SENSITIVITY_PERCENT}
              step={WHEEL_ZOOM_SENSITIVITY_STEP}
              value={wheelZoomSensitivityPercent}
              aria-valuetext={`${wheelZoomSensitivityPercent}% of standard wheel zoom`}
              onChange={(event) => updateAppearancePreferences({
                wheelZoomSensitivityPercent: Number(event.currentTarget.value),
              })}
            />
            <span>Faster</span>
          </div>
          <button
            type="button"
            className="systemsketch-settings__sensitivity-reset"
            disabled={wheelZoomSensitivityPercent === DEFAULT_WHEEL_ZOOM_SENSITIVITY_PERCENT}
            onClick={() => updateAppearancePreferences({
              wheelZoomSensitivityPercent: DEFAULT_WHEEL_ZOOM_SENSITIVITY_PERCENT,
            })}
          >
            Reset to standard
          </button>
        </div>
      </section> : null}

      <section className="systemsketch-settings__appearance-section" aria-labelledby="zoom-controls-title">
        <div className="systemsketch-settings__appearance-heading">
          <h3 id="zoom-controls-title">Zoom controls</h3>
          <p>Choose how compact the bottom-right navigation strip should be.</p>
        </div>
        <button
          type="button"
          role="switch"
          className="systemsketch-settings__toggle-row"
          aria-checked={showZoomButtons}
          data-testid="systemsketch-show-zoom-buttons"
          onClick={() => updateAppearancePreferences({ showZoomButtons: !showZoomButtons })}
        >
          <span>
            <strong>Show zoom −/+ buttons</strong>
            <small>The zoom percentage remains available when these step buttons are hidden.</small>
          </span>
          <i aria-hidden="true"><span /></i>
        </button>
      </section>
    </section>
  )
}

/**
 * A miniature of the theme: its canvas, a panel on it, a line of text and the
 * accent. Painted from the palette's own values — those are data, not chrome,
 * which is why they may be inline here. "Match system" shows both halves.
 */
function ThemeSwatch({ option, palettes }: { option: ThemeOption; palettes: readonly ThemePalette[] }) {
  const halves: SwatchTokens[] = option.choice.kind === 'palette'
    ? [swatchOf(palettes, option.id)]
    : option.scheme === 'system'
      ? [SYSTEMSKETCH_SWATCHES.light, SYSTEMSKETCH_SWATCHES.dark]
      : [SYSTEMSKETCH_SWATCHES[option.scheme]]
  return (
    <span className="systemsketch-theme-swatch" aria-hidden="true" data-halves={halves.length}>
      {halves.map((tokens, index) => (
        <span
          key={index}
          className="systemsketch-theme-swatch__half"
          style={{
            '--swatch-surface': tokens.surface,
            '--swatch-raised': tokens.surfaceRaised,
            '--swatch-text': tokens.text,
            '--swatch-accent': tokens.accent,
            '--swatch-border': tokens.border,
          } as CSSProperties}
        >
          <i className="systemsketch-theme-swatch__panel" />
          <i className="systemsketch-theme-swatch__accent" />
        </span>
      ))}
    </span>
  )
}

function swatchOf(palettes: readonly ThemePalette[], id: string): SwatchTokens {
  const palette = palettes.find((item) => item.id === id)
  return palette ? palette.tokens : SYSTEMSKETCH_SWATCHES.light
}

function AppearancePanel() {
  const choice = useThemeChoice()
  const imported = useImportedPalettes()
  const {
    punctuatedPortRow,
  } = useAppearancePreferences()
  const options = themeOptions(BUILT_IN_PALETTES, imported)
  const palettes = [...BUILT_IN_PALETTES, ...imported]
  const fileInput = useRef<HTMLInputElement | null>(null)
  const themeRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [importMessage, setImportMessage] = useState<{ kind: 'error' | 'note'; text: string } | null>(null)
  const activeIndex = options.findIndex((option) => sameChoice(option.choice, choice))

  /**
   * Arrow keys walk the theme list and choose as they go, which is what
   * `role="radiogroup"` promises. Home/End jump to the ends; every other key
   * falls through so the dialog's own handling is untouched.
   */
  const onThemeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const from = activeIndex === -1 ? 0 : activeIndex
    let next = from
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (from + 1) % options.length
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (from - 1 + options.length) % options.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = options.length - 1
    else return
    event.preventDefault()
    event.stopPropagation()
    updateThemeChoice(options[next].choice)
    queueMicrotask(() => themeRefs.current[next]?.focus())
  }

  const onImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    try {
      const theme = parseVsCodeThemeText(await file.text())
      if (!theme.colors || Object.keys(theme.colors).length === 0) {
        throw new Error(`${file.name} has no "colors" table, so it is not a VS Code colour theme.`)
      }
      const name = theme.name ?? file.name.replace(/\.jsonc?$/i, '')
      const { palette, fallbacks } = paletteFromVsCodeTheme(theme, {
        id: `imported:${slugify(name)}`,
        label: name,
        source: `Imported from ${file.name}`,
      })
      addImportedPalette(palette)
      setImportMessage(fallbacks.length
        ? {
            kind: 'note',
            text: `Imported ${name}. It did not name ${fallbacks.length} of the ${Object.keys(palette.tokens).length} tokens (${fallbacks.join(', ')}); those use VS Code's defaults.`,
          }
        : { kind: 'note', text: `Imported ${name}; every token came from the theme itself.` })
    } catch (cause) {
      setImportMessage({ kind: 'error', text: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      input.value = ''
    }
  }

  return (
    <section className="systemsketch-settings__panel" aria-labelledby="appearance-title">
      <div className="systemsketch-settings__eyebrow">Appearance</div>
      <div className="systemsketch-settings__intro">
        <div>
          <h2 id="appearance-title">Color theme</h2>
          <p>The board, its menus and every panel wear one theme. Import a VS Code or Cursor theme file to use it here.</p>
        </div>
      </div>

      <div
        className="systemsketch-theme-list"
        role="radiogroup"
        aria-label="Color theme"
        data-testid="systemsketch-theme-list"
        onKeyDown={onThemeKeyDown}
      >
        {options.map((option, index) => {
          const active = sameChoice(option.choice, choice)
          return (
            <div key={option.id} className={`systemsketch-theme-option${active ? ' is-active' : ''}`}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                /* A radiogroup is one tab stop; the arrows move inside it.
                   Every radio used to be tabbable, so reaching the control
                   below meant Tab past however many themes are installed —
                   and the arrow keys, which is how a radiogroup is actually
                   operated, did nothing at all. */
                tabIndex={active || (activeIndex === -1 && index === 0) ? 0 : -1}
                ref={(element) => { themeRefs.current[index] = element }}
                data-testid={`systemsketch-theme-option-${option.id}`}
                onClick={() => updateThemeChoice(option.choice)}
              >
                <ThemeSwatch option={option} palettes={palettes} />
                <span className="systemsketch-theme-option__text">
                  <span className="systemsketch-theme-option__label">{option.label}</span>
                  <span className="systemsketch-theme-option__detail">{option.detail}</span>
                </span>
              </button>
              {option.removable ? (
                <button
                  type="button"
                  className="systemsketch-theme-option__remove"
                  aria-label={`Remove ${option.label}`}
                  title="Remove this imported theme"
                  onClick={() => removeImportedPalette(option.id)}
                >
                  ×
                </button>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="systemsketch-settings__note">
        <span className="systemsketch-settings__saved-dot" aria-hidden="true" />
        <div>
          <strong>Saved on this computer</strong>
          <p>Shape colours are part of each board and look the same in every theme; only the app around them changes.</p>
        </div>
      </div>

      <div className="systemsketch-settings__actions">
        <button
          type="button"
          className="systemsketch-settings__import"
          data-testid="systemsketch-theme-import-button"
          onClick={() => fileInput.current?.click()}
        >
          Import VS Code theme…
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,.jsonc,application/json"
          hidden
          data-testid="systemsketch-theme-import"
          onChange={(event) => void onImportFile(event)}
        />
        <span className="systemsketch-settings__hint">
          A theme's <code>.json</code> from VS Code, Cursor or the marketplace.
        </span>
      </div>
      {importMessage ? (
        <p
          className={`systemsketch-settings__message is-${importMessage.kind}`}
          role={importMessage.kind === 'error' ? 'alert' : 'status'}
          data-testid="systemsketch-theme-import-message"
        >
          {importMessage.text}
        </p>
      ) : null}

      <section className="systemsketch-settings__appearance-section" aria-labelledby="port-row-punctuation-title">
        <div className="systemsketch-settings__appearance-heading">
          <h3 id="port-row-punctuation-title">Inputs row style</h3>
          <p>Read a Block's ports as <code>name: type = default</code>, or keep the plain row.</p>
        </div>
        <button
          type="button"
          role="switch"
          className="systemsketch-settings__toggle-row"
          aria-checked={punctuatedPortRow}
          data-testid="systemsketch-punctuated-port-row"
          onClick={() => updateAppearancePreferences({ punctuatedPortRow: !punctuatedPortRow })}
        >
          <span>
            <strong>Code-style Inputs row</strong>
            <small>Name, Type and Default all render in monospace, joined by a muted ':' and '='.</small>
          </span>
          <i aria-hidden="true"><span /></i>
        </button>
      </section>
    </section>
  )
}
