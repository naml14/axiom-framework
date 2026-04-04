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

// --- App ---
export { createApp } from './app.js'
export type { App, AppOptions, RenderMetrics } from './app.js'

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
  // Signals
  Signal,
  ComputedSignal,
  // Components
  ComponentDefinition,
  ComponentNode,
  ElementNode,
  TextNode,
  FragmentNode,
  // Layout
  PreparedComponent,
  LayoutResult,
  LayoutConstraints,
  LayoutProps,
} from './types.js'
