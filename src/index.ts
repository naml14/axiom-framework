// Axiom — Public API
export { signal, computed, effect } from './signals.js'
export { defineComponent } from './component.js'
export {
  prepare,
  getMetrics,
  getNodeType,
  getTag,
  getChildren,
  getNodeIndex,
  countNodes,
  forEachNode,
  getLayoutProps,
  getTextHandle,
  getKey,
  getClasses,
  getAttrs,
  getTextContent,
} from './prepare.js'
export { reflow, createLayoutResult } from './reflow.js'
export { createApp, type App, type AppOptions, type RenderMetrics } from './app.js'
export { scheduleRender, cancelScheduled, resetScheduler, setScheduler, type SchedulerFn } from './scheduler.js'
export { fastDiff, fullDiff, type DOMOperation } from './diff.js'
export { applyOps, commitFull, type DOMState } from './commit.js'
export type {
  Signal,
  ComputedSignal,
  ComponentDefinition,
  PreparedComponent,
  ComponentNode,
  ElementNode,
  TextNode,
  FragmentNode,
  LayoutResult,
  LayoutConstraints,
  LayoutProps,
} from './types.js'
