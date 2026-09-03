/**
 * The inspector's multi-selection face.
 *
 * Excalidraw's rule, which this follows: selecting many objects keeps the
 * panel open and shows the properties they have in common, with a value that
 * reads "Mixed" when they disagree. tldraw already computes exactly that for
 * `StyleProp`s, so this component is presentation over `SharedStyle` and
 * nothing more — it never reads or writes a Block record directly.
 *
 * What is absent is deliberate. Title, type, description text, notes and ports
 * are each Block's identity; a batch write would overwrite nine of them with
 * one value. Those stay behind a single selection.
 */
import type { SharedStyle } from 'tldraw'

import {
  BLOCK_VIEWS,
  PORT_LAYOUTS,
  type BlockView,
  type PortLayout,
} from '../blockModel'
import './block-inspector.css'

export interface BlockBatchInspectorActions {
  setView(view: BlockView): void
  setPortLayout(portLayout: PortLayout): void
  setShowDescription(showDescription: boolean): void
}

export interface BlockBatchInspectorContentProps {
  blockCount: number
  view: SharedStyle<BlockView> | undefined
  portLayout: SharedStyle<PortLayout> | undefined
  showDescription: SharedStyle<boolean> | undefined
  actions?: BlockBatchInspectorActions
  onRequestClose?: () => void
}

function isValue<T>(shared: SharedStyle<T> | undefined, value: T): boolean {
  return shared?.type === 'shared' && shared.value === value
}

function MixedChip({ shared }: { shared: SharedStyle<unknown> | undefined }) {
  if (shared?.type !== 'mixed') return null
  return <span className="block-inspector__mixed-chip">Mixed</span>
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
      <path d="m4 4 8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function portLayoutLabel(portLayout: PortLayout): string {
  return portLayout === 'inline' ? 'aligned' : 'offset'
}

/** Frame-free batch body. Every control writes through one style command. */
export function BlockBatchInspectorContent({
  blockCount,
  view,
  portLayout,
  showDescription,
  actions,
  onRequestClose,
}: BlockBatchInspectorContentProps) {
  const readOnly = !actions
  return (
    <section
      className="block-inspector block-inspector--batch"
      aria-label="Block inspector"
      data-status="multi"
      data-block-count={blockCount}
    >
      <header className="block-inspector__batch-header">
        <span className="block-inspector__batch-title">Batch edit</span>
        {onRequestClose ? (
          <button
            type="button"
            className="block-inspector__dock-close"
            aria-label="Close Block inspector"
            onClick={onRequestClose}
          >
            <CloseIcon />
          </button>
        ) : null}
      </header>

      <div className="block-inspector__body" aria-label="Shared Block details">
        <section className="block-inspector__section" data-inspector-section="View">
          <div className="block-inspector__section-title">
            <span>View</span>
            <MixedChip shared={view} />
          </div>
          <div className="block-inspector__choices" role="group" aria-label="Block view">
            {BLOCK_VIEWS.map((candidate) => (
              <button
                key={candidate}
                type="button"
                disabled={readOnly}
                aria-pressed={isValue(view, candidate)}
                onClick={() => actions?.setView(candidate)}
              >
                {candidate}
              </button>
            ))}
          </div>
          <p className="block-inspector__hint">
            Applies to every selected Block · each Block keeps its own remembered size per view.
          </p>
        </section>

        <section className="block-inspector__section" data-inspector-section="Ports">
          <div className="block-inspector__section-title">
            <span>Ports</span>
            <MixedChip shared={portLayout} />
          </div>
          <div className="block-inspector__choices" role="group" aria-label="Port layout">
            {PORT_LAYOUTS.map((candidate) => (
              <button
                key={candidate}
                type="button"
                disabled={readOnly}
                aria-pressed={isValue(portLayout, candidate)}
                onClick={() => actions?.setPortLayout(candidate)}
              >
                {portLayoutLabel(candidate)}
              </button>
            ))}
          </div>
          <p className="block-inspector__hint">
            Aligned shares rows between inputs and outputs; offset stacks the outputs below the
            inputs.
          </p>
        </section>

        <section className="block-inspector__section" data-inspector-section="Display">
          <div className="block-inspector__section-title">
            <span>Display</span>
            <MixedChip shared={showDescription} />
          </div>
          <div
            className="block-inspector__choices"
            role="group"
            aria-label="Display description"
          >
            <button
              type="button"
              disabled={readOnly}
              aria-pressed={isValue(showDescription, true)}
              onClick={() => actions?.setShowDescription(true)}
            >
              show description
            </button>
            <button
              type="button"
              disabled={readOnly}
              aria-pressed={isValue(showDescription, false)}
              onClick={() => actions?.setShowDescription(false)}
            >
              hide description
            </button>
          </div>
        </section>

        <section className="block-inspector__section" data-inspector-section="Per-Block">
          <div className="block-inspector__section-title">Per-Block</div>
          <p className="block-inspector__hint">
            Title, type, notes and ports identify each Block, so they are never written as a batch.
            Select a single Block to edit them.
          </p>
        </section>
      </div>
    </section>
  )
}
