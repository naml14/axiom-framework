// ============================================================
// src/syntax/index.ts — Re-exporta toda la capa de sintaxis
// ============================================================

export { h, t, fragment, normalizeChildren } from './h.js'
export { stack, vstack, row, grid, box }    from './layout.js'
export { For, Show, Switch, Match, Each }   from './flow.js'
export type { SwitchCase }                  from './flow.js'

export type {
  HProps,
  HChild,
  AxiomEventHandlers,
  LayoutShortcuts,
  HtmlAttrs,
  ResponsiveMap,
} from './types.js'

export type {
  StackProps,
  RowProps,
  GridProps,
} from './layout.js'
