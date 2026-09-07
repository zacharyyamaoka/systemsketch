import { useState } from 'react'
import type { Editor } from 'tldraw'
import { ExpandingExpressionField } from './ExpandingExpressionField'
import { useVariableRegistry } from './useVariableRegistry'
import './variableRegistryPanel.css'

/**
 * The one place every global variable lives, board-wide. A Block's own
 * "Variables used here" section (in `BlockInspector`) edits the same
 * entries in place for convenience; this panel is where you come to see
 * everything at once, rename a variable, or remove one nothing references
 * anymore. A variable's own value is the same expression field as any
 * property's — including being able to reference another variable, which
 * is exactly what makes a circular reference here a real, reported error
 * rather than a hang.
 */
export function VariableRegistryPanel({ editor }: { editor: Editor }) {
  const registry = useVariableRegistry(editor)
  const [newName, setNewName] = useState('')

  const addVariable = () => {
    const trimmed = newName.trim()
    if (!trimmed || registry.entries.some((entry) => entry.name === trimmed)) return
    registry.setEntryValue(trimmed, '0')
    setNewName('')
  }

  return (
    <div className="ss-registry-panel">
      {registry.entries.length === 0 ? (
        <p className="ss-registry-panel__empty">
          No shared variables yet. Add one below, or just type a new name into any property's
          expression — it shows up here the moment something references it.
        </p>
      ) : (
        <ul className="ss-registry-panel__list">
          {registry.entries.map((entry) => (
            <li key={entry.id} className="ss-registry-panel__row">
              <input
                className="ss-registry-panel__name"
                value={entry.name}
                disabled={registry.readOnly}
                aria-label={`Variable name (${entry.name})`}
                onChange={(event) => registry.renameEntry(entry.id, event.target.value)}
              />
              <ExpandingExpressionField
                className="ss-registry-panel__value"
                value={entry.expression}
                disabled={registry.readOnly}
                registry={registry.registryMap}
                ariaLabel={`Value for ${entry.name}`}
                onWrite={(expression) => registry.setEntryValue(entry.name, expression)}
              />
              <button
                type="button"
                className="ss-registry-panel__delete"
                disabled={registry.readOnly}
                aria-label={`Remove ${entry.name}`}
                onClick={() => registry.removeEntry(entry.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="ss-registry-panel__add"
        onSubmit={(event) => { event.preventDefault(); addVariable() }}
      >
        <input
          className="ss-registry-panel__add-input"
          placeholder="new_variable_name"
          value={newName}
          disabled={registry.readOnly}
          aria-label="New variable name"
          onChange={(event) => setNewName(event.target.value)}
        />
        <button type="submit" className="ss-registry-panel__add-button" disabled={registry.readOnly || !newName.trim()}>
          Add
        </button>
      </form>
    </div>
  )
}
