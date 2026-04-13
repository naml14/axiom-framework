// ============================================================
// axiom-framework — Public API
// ============================================================
//
// This is the ONLY surface consumers should import from.
// Internal modules (prepare internals, diff, commit, scheduler)
// are NOT exported here — they are implementation details that
// can change between minor versions without semver guarantees.
// ============================================================

// --- Reactivity ---
export { signal, computed, effect } from './signals.js'

// --- Components ---
export { defineComponent } from './component.js'

// --- Portals ---
export { createPortal } from './portal.js'

// --- App ---
export { createApp } from './app.js'
export type { App, AppOptions, AppErrorContext, AppErrorPhase, RenderMetrics } from './app.js'

// --- SSR / Hydration ---
export { renderToString } from './ssr.js'
export { commitHydrate } from './commit.js'
export type { SSRRenderOptions } from './ssr.js'
export type { HydrationOptions, HydrationResult } from './types.js'

// --- Router ---
export { createRouter, defineAsyncComponent } from './router.js'
export type { Route, RouteState, Router } from './router.js'

// --- Layout (advanced — for custom rendering pipelines) ---
export { prepare } from './prepare.js'
export { reflow } from './reflow.js'

// --- Context ---
export {
  createContext,
  withContext,
  useContext,
  createStore,
  provideStore,
  injectStore,
} from './context.js'
export type { Context, StoreInstance } from './context.js'

// --- Forms ---
export { bind, validate, required, minLength, maxLength, pattern } from './forms.js'
export type {
  ValidationRule,
  ValidationResult,
  ValidateOptions,
  SyncRule,
  AsyncRule,
} from './forms.js'

// --- Types ---
export type {
  AxiomDevHook,
  AxiomDevMetrics,
  AxiomDevProfilingMetadata,
  // Signals
  Signal,
  ComputedSignal,
  // Components
  ComponentDefinition,
  ComponentNode,
  ElementNode,
  TextNode,
  FragmentNode,
  PortalNode,
  // Layout
  PreparedComponent,
  LayoutResult,
  LayoutConstraints,
  LayoutProps,
  ProfileEvent,
  ProfileSubscriber,
} from './types.js'
