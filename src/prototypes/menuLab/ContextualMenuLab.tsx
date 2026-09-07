/**
 * The lever board. Every control on the left composes the REAL contextual
 * menu on the right — same registry, same binder, same renderer as the
 * appearance pill. See `menuLabModel.ts` for the prior art this follows and
 * why the lab is not a second implementation.
 *
 * Two entry points, one board:
 *
 * - `MenuLabPanel` is what Settings → Menu lab renders. It mounts nothing of
 *   its own: the dialog is already inside the app's editor and UI context, so
 *   the panel gets the live theme and tldraw's own popover for free.
 * - `ContextualMenuLab` is the standalone `?menu-lab` route, which has no app
 *   around it and therefore has to supply that context itself.
 */
import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import { useState } from 'react'
import { ContainerProvider, Tldraw, useContainer, useEditor } from 'tldraw'
import 'tldraw/tldraw.css'

// The theme vocabulary itself. Loaded here because the standalone route is
// its own entry point and nothing else pulls it in — without this every
// `--ss-*` resolves to nothing and the page renders transparent-on-canvas,
// which is exactly what it did.
import '../../theme/tokens.css'
import { ContextualControls } from '../../contextualMenus/ContextualControls'
import {
  CONTEXTUAL_CONTROL_REGISTRY,
  contextualControlIds,
  type ContextualControlKind,
  type ContextualControlLayout,
  type ContextualControlTrigger,
} from '../../contextualMenus/contextualControlRegistry'
import {
  LAB_LAYOUTS,
  LAB_PRESETS,
  LAB_STACK_PLACEMENTS,
  LAB_TRIGGERS,
  LAB_VALUE_STATES,
  labComposition,
  labDangling,
  labRecipeSource,
  moveLabControl,
  setLabControl,
  type LabControlState,
  type LabStackPlacement,
  type LabState,
  type LabValueState,
} from './menuLabModel'
import './menu-lab.css'

/* The same locally bundled assets the product mounts with. A bare `<Tldraw>`
 * reaches for tldraw's CDN, which is both a network dependency and a wall of
 * console errors in an offline journey. */
const ASSET_URLS = getAssetUrlsByImport()

export function ContextualMenuLab() {
  return (
    <div className="menu-lab menu-lab--standalone" data-testid="menu-lab">
      {/* WHY a real editor rather than a bare div: the renderer reads swatch
       * colours off the live theme and opens tldraw's own popover primitive.
       * A lab that mocked either would stop reproducing product bugs, which is
       * the only reason to have one. Inside the app, Settings supplies the
       * same context and this wrapper is not used. */}
      <Tldraw
        hideUi
        assetUrls={ASSET_URLS}
        components={{ Background: null }}
        onMount={(editor) => { editor.updateInstanceState({ isReadonly: true }) }}
      >
        <MenuLabPanel standalone />
      </Tldraw>
    </div>
  )
}

/** The board itself. Requires an editor + UI context; supplies none. */
export function MenuLabPanel({ standalone }: { standalone?: boolean }) {
  const editor = useEditor()
  const container = useContainer()
  // WHY the popovers are portaled into the host dialog rather than the editor
  // container: tldraw stacks its popover layer at z-index 400 and its dialog
  // layer at 500 (measured), so a contextual popover opened from inside
  // Settings renders *behind* the dialog that hosts it — the panel is there,
  // painted under the lever rows. Overriding the container for this subtree
  // fixes both popover modes at once, because `TldrawUiPopoverContent` and
  // the Radix path both portal into `useContainer()`. Outside a dialog this
  // resolves to the editor container and nothing changes.
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [state, setState] = useState<LabState>(LAB_PRESETS[0].state)
  const [log, setLog] = useState<string[]>([])
  const composition = labComposition(state, (kind, value) => {
    setLog((entries) => [`${kind} → ${value ?? '(action)'}`, ...entries].slice(0, 8))
  })
  const ids = contextualControlIds(composition)
  const dangling = labDangling(state)

  return (
    <ContainerProvider container={host ?? container}>
      <div
        className={standalone ? 'menu-lab__shell' : 'menu-lab__shell menu-lab__shell--embedded'}
        data-testid="menu-lab-shell"
        ref={(node) => {
          setHost(node?.closest<HTMLElement>('.tlui-dialog__positioner') ?? null)
        }}
      >
        <aside className="menu-lab__levers">
          {/* Settings draws its own eyebrow and title, so the embedded board
           * would otherwise carry a second heading for the same panel. */}
          {standalone ? (
            <header className="menu-lab__header">
              <h1>Contextual menu lab</h1>
              <p>
                One registry, one renderer, many surfaces. Every menu in
                SystemSketch is these levers — press them and the real menu
                beside them recomposes.
              </p>
            </header>
          ) : null}

          <section className="menu-lab__section">
            <h2>Start from</h2>
            <div className="menu-lab__presets">
              {LAB_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  data-testid={`menu-lab-preset-${preset.id}`}
                  onClick={() => setState(preset.state)}
                  title={preset.detail}
                >
                  <strong>{preset.label}</strong>
                  <span>{preset.detail}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="menu-lab__section">
            <h2>Surface</h2>
            <label className="menu-lab__field">
              <span>Popover mode</span>
              <select
                data-testid="menu-lab-popover-mode"
                value={state.popoverMode}
                onChange={(event) => setState({
                  ...state,
                  popoverMode: event.target.value as LabState['popoverMode'],
                })}
              >
                <option value="selection">selection — tldraw popover</option>
                <option value="editing">editing — keeps a text editor open</option>
              </select>
            </label>
          </section>

          <section className="menu-lab__section">
            <h2>Controls</h2>
            <p className="menu-lab__hint">
              <code>stack</code> folds a control into the next one below it:
              <code>above</code> is the shape's stacked popover,
              <code>beside</code> is the connector's one-line row.
              A <code>row</code> layout hides the labels.
            </p>
            <div className="menu-lab__controls">
              {state.controls.map((control) => (
                <LabControlRow
                  key={control.kind}
                  control={control}
                  onChange={(patch) => setState(setLabControl(state, control.kind, patch))}
                  onMove={(direction) => setState(moveLabControl(state, control.kind, direction))}
                />
              ))}
            </div>
          </section>
        </aside>

        <main className="menu-lab__stage">
          <section className="menu-lab__preview">
            <h2>The composed menu</h2>
            <div className="menu-lab__pill">
              {composition.groups.length > 0 ? (
                <ContextualControls
                  composition={composition}
                  popoverMode={state.popoverMode}
                  testId="menu-lab-menu"
                  label="Lab menu"
                />
              ) : (
                <p className="menu-lab__empty">
                  Nothing included yet — tick a control on the left.
                </p>
              )}
            </div>
            <p className="menu-lab__hint">
              Click a trigger to open its popover. Editor: {editor.getInstanceState().isReadonly
                ? 'read-only canvas behind the lab'
                : 'live'}
            </p>
          </section>

          <section className="menu-lab__readout">
            <h2>What that composed to</h2>
            <dl>
              <dt>Groups</dt>
              <dd data-testid="menu-lab-groups">
                {composition.groups.map((group) => group.id).join(' · ') || '—'}
              </dd>
              <dt>Order</dt>
              <dd data-testid="menu-lab-order">{ids.join(' · ') || '—'}</dd>
            </dl>
            {dangling.length > 0 ? (
              <p className="menu-lab__warning" data-testid="menu-lab-dangling">
                Stacked onto nothing, so not rendered: {dangling.join(', ')}. A stacked
                control folds into the next included control below it — move it up, or
                set stack back to <code>none</code>.
              </p>
            ) : null}
            <pre data-testid="menu-lab-recipe">{labRecipeSource(state)}</pre>
          </section>

          <section className="menu-lab__readout">
            <h2>Last writes</h2>
            <ul data-testid="menu-lab-log">
              {log.length === 0 ? <li>Nothing pressed yet.</li> : null}
              {log.map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}
            </ul>
          </section>
        </main>
      </div>
    </ContainerProvider>
  )
}

function LabControlRow({
  control,
  onChange,
  onMove,
}: {
  control: LabControlState
  onChange(patch: Partial<LabControlState>): void
  onMove(direction: -1 | 1): void
}) {
  const definition = CONTEXTUAL_CONTROL_REGISTRY[control.kind]
  return (
    <div
      className="menu-lab__control"
      data-kind={control.kind}
      data-included={control.included ? '' : undefined}
      data-testid={`menu-lab-control-${control.kind}`}
    >
      <label className="menu-lab__include">
        <input
          type="checkbox"
          data-testid={`menu-lab-include-${control.kind}`}
          checked={control.included}
          onChange={(event) => onChange({ included: event.target.checked })}
        />
        <span>
          <strong>{definition.label}</strong>
          <code>{control.kind}</code>
        </span>
      </label>
      <div className="menu-lab__levers-row">
        <LabSelect
          label="layout"
          kind={control.kind}
          value={control.layout}
          options={LAB_LAYOUTS}
          onChange={(value) => onChange({ layout: value as ContextualControlLayout })}
        />
        <LabSelect
          label="trigger"
          kind={control.kind}
          value={control.trigger}
          options={LAB_TRIGGERS}
          onChange={(value) => onChange({ trigger: value as ContextualControlTrigger })}
        />
        <LabSelect
          label="stack"
          kind={control.kind}
          value={control.stack}
          options={LAB_STACK_PLACEMENTS}
          onChange={(value) => onChange({ stack: value as LabStackPlacement })}
        />
        <LabSelect
          label="value"
          kind={control.kind}
          value={control.value}
          options={LAB_VALUE_STATES}
          onChange={(value) => onChange({ value: value as LabValueState })}
        />
        <label className="menu-lab__toggle">
          <input
            type="checkbox"
            data-testid={`menu-lab-break-${control.kind}`}
            checked={control.breakBefore}
            onChange={(event) => onChange({ breakBefore: event.target.checked })}
          />
          <span>new group</span>
        </label>
        <span className="menu-lab__move">
          <button type="button" aria-label={`Move ${definition.label} earlier`} onClick={() => onMove(-1)}>↑</button>
          <button type="button" aria-label={`Move ${definition.label} later`} onClick={() => onMove(1)}>↓</button>
        </span>
      </div>
    </div>
  )
}

function LabSelect({
  label,
  kind,
  value,
  options,
  onChange,
}: {
  label: string
  kind: ContextualControlKind
  value: string
  options: readonly string[]
  onChange(value: string): void
}) {
  return (
    <label className="menu-lab__select">
      <span>{label}</span>
      <select
        data-testid={`menu-lab-${label}-${kind}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  )
}
