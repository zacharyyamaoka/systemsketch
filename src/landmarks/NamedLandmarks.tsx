import { useEffect, useState } from 'react'
import { useEditor, useValue } from 'tldraw'
import {
  addBoardLandmark,
  focusBoardLandmark,
  getBoardLandmarks,
  getBoardLandmarkState,
  removeBoardLandmark,
  renameBoardLandmark,
  suggestedLandmarkName,
  type LandmarkMutation,
} from './boardLandmarks'

function failureMessage(result: LandmarkMutation): string | null {
  if (result.ok) return null
  if (result.reason === 'duplicate-name') return 'Choose a distinct landmark name.'
  if (result.reason === 'invalid-name') return 'Enter a name (up to 80 characters).'
  if (result.reason === 'unsupported-version') return 'Saved views use a newer format. They were not changed.'
  if (result.reason === 'malformed') return 'Saved-view metadata needs repair before it can be changed.'
  if (result.reason === 'readonly') return 'This document is read-only. Saved views were not changed.'
  if (result.reason === 'unchanged') return null
  return 'That landmark no longer exists.'
}

function SaveCurrentView({ locked }: { locked: boolean }) {
  const editor = useEditor()
  const landmarks = useValue(
    'named landmark suggestions',
    () => getBoardLandmarks(editor),
    [editor],
  )
  const [name, setName] = useState(() => suggestedLandmarkName(landmarks))
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!name.trim()) setName(suggestedLandmarkName(landmarks))
  }, [landmarks, name])

  const save = () => {
    if (locked) {
      setMessage('Saved views cannot be changed in this document state.')
      return
    }
    const result = addBoardLandmark(editor, name)
    if (!result.ok) {
      setMessage(failureMessage(result))
      return
    }
    setName(suggestedLandmarkName([...landmarks, result.landmark]))
    setMessage(null)
  }

  return (
    <form
      className="systemsketch-named-landmarks__save"
      onSubmit={(event) => { event.preventDefault(); save() }}
    >
      <label htmlFor="systemsketch-landmark-name">Save current view</label>
      <div>
        <input
          id="systemsketch-landmark-name"
          data-testid="systemsketch-landmark-name"
          maxLength={80}
          value={name}
          placeholder="Landmark name"
          onChange={(event) => { setName(event.currentTarget.value); setMessage(null) }}
        />
        <button type="submit" data-testid="systemsketch-landmark-save" disabled={locked}>Save</button>
      </div>
      {message ? <p role="alert">{message}</p> : null}
    </form>
  )
}

function LandmarkRow({ id, name, locked }: { id: string; name: string; locked: boolean }) {
  const editor = useEditor()
  const [draft, setDraft] = useState(name)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => setDraft(name), [name])

  const rename = () => {
    const result = renameBoardLandmark(editor, id, draft)
    if (!result.ok) {
      setMessage(failureMessage(result))
      if (result.reason !== 'unchanged') setDraft(name)
      return
    }
    setMessage(null)
  }

  return (
    <li className="systemsketch-named-landmarks__row" data-landmark-id={id}>
      <button
        type="button"
        className="systemsketch-named-landmarks__jump"
        data-testid={`systemsketch-landmark-jump-${id}`}
        title={`Go to ${name}`}
        onClick={() => focusBoardLandmark(editor, id)}
      >
        <span aria-hidden="true">⌖</span>
        <span>{name}</span>
      </button>
      <input
        aria-label={`Rename ${name}`}
        data-testid={`systemsketch-landmark-rename-${id}`}
        maxLength={80}
        disabled={locked}
        value={draft}
        onBlur={rename}
        onChange={(event) => { setDraft(event.currentTarget.value); setMessage(null) }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          } else if (event.key === 'Escape') {
            setDraft(name)
            event.currentTarget.blur()
          }
        }}
      />
      <button
        type="button"
        className="systemsketch-named-landmarks__remove"
        data-testid={`systemsketch-landmark-remove-${id}`}
        aria-label={`Delete ${name}`}
        title={`Delete ${name}`}
        disabled={locked}
        onClick={() => {
          const result = removeBoardLandmark(editor, id)
          if (!result.ok) setMessage(failureMessage(result))
        }}
      >×</button>
      {message ? <p role="alert">{message}</p> : null}
    </li>
  )
}

/**
 * A compact, board-persisted camera bookmark list.
 *
 * The live `useValue` read is intentional: save/rename/delete write page
 * metadata through tldraw, so the panel updates from the same durable board
 * transaction as autosave rather than maintaining a second React-only list.
 */
export function NamedLandmarks() {
  const editor = useEditor()
  const landmarks = useValue(
    'named board landmarks',
    () => getBoardLandmarks(editor),
    [editor],
  )
  const state = useValue(
    'named board landmark status',
    () => getBoardLandmarkState(editor),
    [editor],
  )
  const readonly = useValue(
    'named board landmark readonly',
    () => editor.getIsReadonly(),
    [editor],
  )
  const locked = readonly || state.kind !== 'ready'
  const status = readonly
    ? 'This document is read-only. Saved views cannot be changed.'
    : state.kind === 'unsupported-version'
      ? 'Saved views use an unknown format. This panel will not overwrite them.'
      : state.kind === 'malformed'
        ? 'Saved-view metadata is malformed. This panel will not overwrite it.'
        : null

  return (
    <section className="systemsketch-named-landmarks" aria-labelledby="systemsketch-named-landmarks-heading">
      <header>
        <div>
          <span>Saved views</span>
          <h3 id="systemsketch-named-landmarks-heading">Landmarks</h3>
        </div>
        <small>{landmarks.length}</small>
      </header>
      <p className="systemsketch-named-landmarks__intro">
        Named camera views travel with this board. They do not create pages or hierarchy.
      </p>
      {status ? <p className="systemsketch-named-landmarks__status" role="status">{status}</p> : null}
      <SaveCurrentView locked={locked} />
      {landmarks.length ? (
        <ul data-testid="systemsketch-named-landmarks-list">
          {landmarks.map((landmark) => <LandmarkRow key={landmark.id} locked={locked} {...landmark} />)}
        </ul>
      ) : (
        <p className="systemsketch-named-landmarks__empty" data-testid="systemsketch-named-landmarks-empty">
          Save a camera view to make a quick return point.
        </p>
      )}
    </section>
  )
}
