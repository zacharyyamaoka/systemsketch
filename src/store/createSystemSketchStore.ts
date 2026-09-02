import {
  createTLStore,
  defaultBindingUtils,
  defaultShapeUtils,
  type TLAnyBindingUtilConstructor,
  type TLAnyShapeUtilConstructor,
} from 'tldraw'
import { SYSTEMSKETCH_THEMES } from '../appearance/figjamPalette'
import { BlockShapeUtil } from '../blocks'
import {
  blockConnectionBindingUtils,
  blockConnectionShapeUtils,
} from '../blocks/connections'
import { SYSTEMSKETCH_COMMENT_RECORDS } from '../comments'
import { EXCALIDRAW_SHAPE_UTILS } from '../excalidrawInterop'

function replaceConstructorsByType<T extends { type: string }>(
  defaults: readonly T[],
  overrides: readonly T[],
): T[] {
  const replaced = new Set(overrides.map((value) => value.type))
  return [...defaults.filter((value) => !replaced.has(value.type)), ...overrides]
}

const STORE_SHAPE_UTILS = replaceConstructorsByType<TLAnyShapeUtilConstructor>(
  defaultShapeUtils,
  [
    ...EXCALIDRAW_SHAPE_UTILS,
    BlockShapeUtil,
    ...blockConnectionShapeUtils,
  ],
)

const STORE_BINDING_UTILS = replaceConstructorsByType<TLAnyBindingUtilConstructor>(
  defaultBindingUtils,
  blockConnectionBindingUtils,
)

/**
 * Build the product store through tldraw's supported schema seam.
 *
 * Comment records are opt-in in tldraw 5.3.2. They must be registered when
 * the store is created; passing an unknown `records` prop to `<Tldraw>` is
 * neither typed nor forwarded by that release.
 */
export function createSystemSketchStore() {
  return createTLStore({
    bindingUtils: STORE_BINDING_UTILS,
    records: SYSTEMSKETCH_COMMENT_RECORDS,
    shapeUtils: STORE_SHAPE_UTILS,
    themes: SYSTEMSKETCH_THEMES,
  })
}
