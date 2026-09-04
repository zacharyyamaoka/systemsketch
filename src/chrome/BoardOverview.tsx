import { useEditor, useValue } from 'tldraw'
import {
  focusBoardOverviewPage,
  focusBoardOverviewTarget,
  getBoardOverviewModel,
  type BoardOverviewTarget,
  type BoardOverviewTargetKind,
} from './boardOverviewModel'

const GROUPS: Array<{ kind: BoardOverviewTargetKind; label: string; icon: string }> = [
  { kind: 'frame', label: 'Frames', icon: '▣' },
  { kind: 'branch', label: 'Branches', icon: '⑂' },
  { kind: 'expanded-block', label: 'Expanded Blocks', icon: '▤' },
]

function TargetRow({ target, icon }: { target: BoardOverviewTarget; icon: string }) {
  const editor = useEditor()
  return (
    <button
      type="button"
      className="systemsketch-board-overview__target"
      data-selected={target.selected || undefined}
      data-overview-target={target.id}
      data-testid={`systemsketch-overview-target-${target.id}`}
      title={`Select and fit ${target.label}`}
      onClick={() => focusBoardOverviewTarget(editor, target)}
    >
      <span className="systemsketch-board-overview__glyph" aria-hidden="true">{icon}</span>
      <span>{target.label}</span>
      <span className="systemsketch-board-overview__fit" aria-hidden="true">⌗</span>
    </button>
  )
}

export function BoardOverview() {
  const editor = useEditor()
  const model = useValue(
    'SystemSketch board overview',
    () => getBoardOverviewModel(editor),
    [editor],
  )

  return (
    <div className="systemsketch-board-overview" data-testid="systemsketch-board-overview">
      <nav aria-label="Board landmarks">
        {model.pages.map((page) => (
          <section key={page.id} className="systemsketch-board-overview__page">
            <button
              type="button"
              className="systemsketch-board-overview__page-row"
              data-overview-page={page.id}
              data-current={page.current || undefined}
              title="Show this board root"
              onClick={() => focusBoardOverviewPage(editor, page.id)}
            >
              <span className="systemsketch-board-overview__glyph" aria-hidden="true">◫</span>
              <strong>Board</strong>
              <span>{page.targets.length}</span>
            </button>
            {GROUPS.map((group) => {
              const targets = page.targets.filter((target) => target.kind === group.kind)
              if (targets.length === 0) return null
              return (
                <div key={group.kind} className="systemsketch-board-overview__group">
                  <h3>{group.label}<span>{targets.length}</span></h3>
                  {targets.map((target) => (
                    <TargetRow key={target.id} target={target} icon={group.icon} />
                  ))}
                </div>
              )
            })}
          </section>
        ))}
      </nav>
      {model.targetCount === 0 ? (
        <div className="systemsketch-board-overview__empty">
          <span aria-hidden="true">▣</span>
          <strong>No board landmarks yet</strong>
          <p>Add a Frame or Branch, or expand a Block. It will appear here as a board landmark.</p>
        </div>
      ) : null}
    </div>
  )
}
