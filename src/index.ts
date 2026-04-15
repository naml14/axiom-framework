// ============================================================
// axiom-framework — Public API
// ============================================================
//
// This is the ONLY surface consumers should import from.
// Internal modules (prepare internals, diff, scheduler)
// are NOT exported here — they are implementation details that
// can change between minor versions without semver guarantees.
//
// Exception: `commitHydrate` is exported as an advanced hydration API.
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
export type { SSRMetadata, SSRRenderOptions } from './ssr.js'
export type { HydrationOptions, HydrationResult } from './types.js'

// --- Router ---
export { createRouter, defineAsyncComponent } from './router.js'
export type { Route, RouteState, Router } from './router.js'

// --- Layout (advanced — for custom rendering pipelines) ---
export { prepare } from './prepare.js'
export { reflow } from './reflow.js'

// --- Responsive + Grid (Ruta B, Fase 1-2) ---
export { resolveResponsiveLayout, resolveLayoutDimension, matchesBreakpoint } from './responsive.js'
export type { ResolvedLayoutProps } from './responsive.js'
export { measureGrid } from './grid.js'

// --- Style API + Tokens (Ruta B, Fase 3) ---
export {
  SAFE_STYLE_KEYS,
  validateStyleProps,
  resolveStyleTokens,
  createTheme,
  applyStyleToElement,
} from './style.js'
export type { SafeStyleKey, SafeStyleProps, ThemeTokens, Theme } from './style.js'

// --- Motion / Animation (Ruta B, Fase 4) ---
export {
  createTransition,
  createAnimationState,
  scheduleTransition,
  cancelTransition,
  applyImmediately,
  getTransitionProgress,
  isTransitioning,
} from './animation.js'
export type { TransitionDefinition, AnimationState, TransitionProperty } from './animation.js'

// --- Plugin / Adapter hooks (Ruta B, Fase 5) ---
export { createPlugin, registerPlugin, getRegisteredPlugins, clearPlugins, applyPluginHook } from './plugin.js'
export type { AxiomPlugin, PluginContext, PluginHook } from './plugin.js'

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
