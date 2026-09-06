/**
 * The async cadence, on whatever shape is wearing it.
 *
 * One line-style vocabulary means one paint: if the menu offers Async on a
 * rectangle and on a connector, both have to draw it, and neither should carry
 * its own copy of the rule. This is that rule once, as a mixin over a stock
 * ShapeUtil — the same seam `stockPrimitiveVisuals` already uses to give stock
 * records exact display values.
 *
 * WHY a wrapper rather than a dash value: `PathBuilder.toSvg` runs an
 * exhaustive switch over tldraw's dash enum and throws on anything it does not
 * know, so an async shape stores a real `solid` dash and wears the cadence
 * over it (`strokeMeta.ts` carries the rest of that reasoning). The live canvas
 * gets the cadence from a stylesheet rule on the one path that carries a
 * `stroke`; the SVG export gets it from a `<g>`, because a copied SVG takes no
 * stylesheet with it. Both are fed the same constant a cable is drawn with.
 *
 * SVG restarts a dash pattern at each `<path>`, and the cadence opens with a
 * long painted carrier, so an arrowhead — its own short path — stays solid.
 */
import { createElement, type CSSProperties } from 'react'

import { ASYNC_PACKET_DASHARRAY } from '../blocks/connections/connectionPresentation'
import { isAsyncStroke } from './strokeMeta'

/** The class the stylesheet hangs the cadence off. */
export const ASYNC_EDGE_CLASS = 'systemsketch-async-edge'

/** The custom property `app.css` reads, so the number lives in one place. */
export const ASYNC_EDGE_VARIABLE = '--systemsketch-async-dasharray'

type ShapeLike = { meta?: Record<string, unknown>; props?: object }

/* eslint-disable @typescript-eslint/no-explicit-any -- a mixin over tldraw's
   ShapeUtil generics: each util narrows `component`/`toSvg` to its own shape
   type, and the wrapper deliberately does not care which one it has. */
type UtilConstructor = new (...args: any[]) => {
  component(shape: any): any
  toSvg?(shape: any, context: any): any
}

/**
 * Wrap a stock ShapeUtil so a shape carrying the async override paints the
 * packet cadence. Every other shape is returned exactly as the base drew it.
 */
export function withAsyncEdge<T extends UtilConstructor>(Base: T): T {
  return class AsyncEdgeShapeUtil extends Base {
    override component(shape: ShapeLike) {
      const rendered = super.component(shape)
      if (!isAsyncStroke(shape)) return rendered
      return createElement(
        'div',
        {
          className: ASYNC_EDGE_CLASS,
          style: {
            display: 'contents',
            [ASYNC_EDGE_VARIABLE]: ASYNC_PACKET_DASHARRAY,
          } as CSSProperties,
        },
        rendered,
      )
    }

    override toSvg(shape: ShapeLike, context: unknown) {
      const rendered = super.toSvg?.(shape, context)
      if (!isAsyncStroke(shape) || rendered === undefined) return rendered
      return createElement(
        'g',
        { strokeDasharray: ASYNC_PACKET_DASHARRAY, strokeLinecap: 'butt' },
        rendered,
      )
    }
  } as unknown as T
}
/* eslint-enable @typescript-eslint/no-explicit-any */
