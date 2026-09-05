import { TldrawUiButtonIcon, useEditor, useTools } from 'tldraw'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { useChrome } from '../chrome/ChromeProvider'
import { LibrarySearchModal, type LibrarySearchItem } from './LibrarySearchModal'
import {
  SHAPE_LIBRARY_ITEMS,
  filterShapeLibraryItems,
  shapeLibraryItemById,
  type ShapeLibraryItem,
} from './shapeLibraryModel'
import { activateShapeLibraryTool } from './shapeLibraryTool'
import {
  PRIMITIVE_SEARCH_MAX_RESULTS,
  PRIMITIVE_SEARCH_WIDTH,
  isChromeShortcutTarget,
  isEditableShortcutTarget,
  isPrimitiveSearchKey,
  placePrimitiveSearch,
  primitiveSearchPanelHeight,
  type PrimitiveSearchPoint,
} from './primitiveSearchModel'
import { useToolAliases } from './toolAliases'

interface PrimitiveSearchInvocation {
  screenPoint: PrimitiveSearchPoint
}

function toolbarObstacleTop(editorContainer: HTMLElement, viewportHeight: number): number {
  const toolbarButton = document.querySelector<HTMLElement>('[data-testid="systemsketch-tool-library"]')
  const toolbar = toolbarButton?.closest<HTMLElement>('.tlui-main-toolbar') ?? toolbarButton
  if (!toolbar) return viewportHeight
  const containerBounds = editorContainer.getBoundingClientRect()
  const toolbarBounds = toolbar.getBoundingClientRect()
  const top = toolbarBounds.top - containerBounds.top
  return top > 0 && top < viewportHeight ? top : viewportHeight
}

/**
 * A primitive-only sibling to the command palette, anchored to the pointer.
 *
 * WHY: S is about choosing what to draw where the user is already looking.
 * Reusing the centred command modal would destroy that Fusion-style spatial
 * promise; inserting immediately would steal the final placement gesture.
 *
 * The chrome itself now lives in `LibrarySearchModal`, which the Behaviors
 * panel shares; this file keeps what is specific to primitives — the `S`
 * shortcut and its guards, the shape catalog, and arming the tool.
 */
export function PrimitiveSearch() {
  const editor = useEditor()
  const tools = useTools()
  const { toolbarSurface } = useChrome()
  const aliases = useToolAliases()
  const [invocation, setInvocation] = useState<PrimitiveSearchInvocation | null>(null)
  const [query, setQuery] = useState('')
  const [layoutRevision, setLayoutRevision] = useState(0)

  const matches = useMemo(
    () => query.trim() ? filterShapeLibraryItems(query, aliases) : [],
    [aliases, query],
  )
  // Identity is the catalog id, so the row test ids stay
  // `systemsketch-primitive-search-<item.id>` exactly as before.
  const rows = useMemo<LibrarySearchItem[]>(() => matches.map((item) => ({
    id: item.id,
    label: item.label,
    detail: item.section,
    icon: <TldrawUiButtonIcon icon={item.icon} />,
    aliases: aliases[item.id] ?? [],
  })), [aliases, matches])

  const close = useCallback(() => {
    setInvocation(null)
    setQuery('')
    editor.focus()
  }, [editor])

  const choose = useCallback((row: LibrarySearchItem) => {
    const item: ShapeLibraryItem | undefined = shapeLibraryItemById(row.id)
    if (item) activateShapeLibraryTool(tools, item)
    close()
  }, [close, tools])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (invocation || toolbarSurface || !isPrimitiveSearchKey(event)) return
      if (!editor.getIsFocused() || editor.getIsReadonly()) return
      if (editor.getEditingShapeId() || editor.inputs.getIsDragging()) return
      if (editor.menus.getOpenMenus().length > 0) return
      if (isEditableShortcutTarget(event.target) || isEditableShortcutTarget(document.activeElement)) return
      if (isChromeShortcutTarget(event.target) || isChromeShortcutTarget(document.activeElement)) return

      event.preventDefault()
      event.stopImmediatePropagation()
      const screenPoint = editor.inputs.getCurrentScreenPoint()
      setQuery('')
      setInvocation({
        screenPoint: { x: screenPoint.x, y: screenPoint.y },
      })
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [editor, invocation, toolbarSurface])

  useEffect(() => {
    if (!invocation) return
    const relayout = () => setLayoutRevision((current) => current + 1)
    window.addEventListener('resize', relayout)
    return () => window.removeEventListener('resize', relayout)
  }, [invocation])

  if (!invocation) return null

  const viewport = editor.getViewportScreenBounds()
  const desiredHeight = primitiveSearchPanelHeight(matches.length)
  const placement = placePrimitiveSearch(
    invocation.screenPoint,
    { w: PRIMITIVE_SEARCH_WIDTH, h: desiredHeight },
    { w: viewport.w, h: viewport.h },
    toolbarObstacleTop(editor.getContainer(), viewport.h),
  )
  void layoutRevision

  return (
    <LibrarySearchModal
      items={rows}
      query={query}
      onQueryChange={setQuery}
      maxResults={PRIMITIVE_SEARCH_MAX_RESULTS}
      target={invocation.screenPoint}
      placement={placement}
      keyChip="S"
      ariaLabel="Search primitive library"
      listAriaLabel="Matching primitives"
      inputAriaLabel="Search primitives"
      placeholder={`Search ${SHAPE_LIBRARY_ITEMS.length} primitives`}
      noun={{ one: 'primitive', many: 'primitives' }}
      verb="arm"
      idleTitle="Primitive library"
      idleHint="Type a shape or connection name."
      emptyTitle="No matching primitives"
      emptyHint="Try arrow, rectangle, decision, or cloud."
      itemAriaLabel={(row) => `Use ${row.label} tool`}
      onChoose={choose}
      onClose={close}
    />
  )
}
