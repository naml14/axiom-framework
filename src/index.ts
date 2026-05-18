// ============================================================
// axiom-framework — Public API
// ============================================================
//
// This is the ONLY surface consumers should import from.
// API Stability Contract (target v1.0.0) is published in this pre-1.0 phase.
// In v0.9.x, this is a forward-compatibility contract; tags point to the 1.0 baseline.
// Internal modules (prepare internals, diff, scheduler)
// are NOT exported here — they are implementation details that
// can change between minor versions without semver guarantees.
//
// Exception: `commitHydrate` is exported as an advanced hydration API.
// ============================================================

// --- Reactivity ---
export { signal, computed, effect, isSignal } from './reactivity/signals.js'

// --- Components ---
export { defineComponent } from './render/component.js'

// --- Portals ---
export { createPortal } from './features/portal.js'

// --- App ---
export { createApp } from './app.js'
export type { App, AppOptions, AppErrorContext, AppErrorPhase, RenderMetrics } from './app.js'

// --- SSR / Hydration ---
export { renderToString } from './ssr.js'
export { commitHydrate } from './render/commit.js'
export type { SSRMetadata, SSRRenderOptions } from './ssr.js'
export type { HydrationOptions, HydrationResult } from './core/types.js'

// --- Router ---
export { createRouter, defineAsyncComponent } from './router.js'
export type { Route, RouteState, Router } from './router.js'

// --- Layout (advanced — for custom rendering pipelines) ---
export { prepare } from './render/prepare.js'
export { reflow } from './render/reflow.js'
export { getLayoutPoolSize } from './render/pool.js'

// --- Responsive + Grid (Ruta B, Fase 1-2) ---
export { resolveResponsiveLayout, resolveLayoutDimension, matchesBreakpoint } from './render/strategy/responsive.js'
export type { ResolvedLayoutProps } from './render/strategy/responsive.js'
export { measureGrid } from './render/engines/grid.js'

// --- Style API + Tokens (Ruta B, Fase 3) ---
export {
  SAFE_STYLE_KEYS,
  validateStyleProps,
  resolveStyleTokens,
  createTheme,
  applyStyleToElement,
} from './features/style.js'
export type { SafeStyleKey, SafeStyleProps, ThemeTokens, Theme } from './features/style.js'

// --- Motion / Animation (Ruta B, Fase 4) ---
export {
  createTransition,
  createAnimationState,
  scheduleTransition,
  cancelTransition,
  applyImmediately,
  getTransitionProgress,
  isTransitioning,
} from './features/animation.js'
export type { TransitionDefinition, AnimationState, TransitionProperty } from './features/animation.js'

// --- Plugin / Adapter hooks (Ruta B, Fase 5) ---
export { createPlugin, registerPlugin, getRegisteredPlugins, clearPlugins, applyPluginHook } from './features/plugin.js'
export type { AxiomPlugin, PluginContext, PluginHook } from './features/plugin.js'

// --- Context ---
export {
  createContext,
  withContext,
  useContext,
  createStore,
  provideStore,
  injectStore,
} from './features/context.js'
export type { Context, StoreInstance } from './features/context.js'

// --- Forms ---
export { bind, validate, required, minLength, maxLength, pattern } from './features/forms.js'
export type {
  ValidationRule,
  ValidationResult,
  ValidateOptions,
  SyncRule,
  AsyncRule,
  SyncRuleFunction,
  AsyncRuleFunction,
} from './features/forms.js'

// --- Syntax Layer (v2.0.0) ---
// Nivel 1: h(), t(), fragment()
// Nivel 2: stack(), vstack, row(), grid(), box(), For, Show, Switch, Match, Each
export { h, t, fragment }             from './syntax/h.js'
export { stack, vstack, row, grid, box } from './syntax/layout.js'
export { For, Show, Switch, Match, Each } from './syntax/flow.js'
export type { SwitchCase }            from './syntax/flow.js'
export type {
  HProps,
  HChild,
  AxiomEventHandlers,
  LayoutShortcuts,
  HtmlAttrs,
  ResponsiveMap,
  StackProps,
  RowProps,
  GridProps,
} from './syntax/index.js'

// --- Streaming SSR (experimental) ---
/** @experimental */
export { renderToReadableStream } from './ssr-stream.js'
/** @experimental */
export type { StreamSSROptions } from './ssr-stream.js'

// --- Server (experimental) ---
/** @experimental */
export { createServer } from './server.js'
/** @experimental */
export type { AxiomServer, AxiomServerOptions } from './server.js'

// --- Static Site Generation ---
export { buildStatic } from './build.js'
export type { BuildStaticOptions, BuildResult, StaticRoute } from './build.js'

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
  ComponentOptions,
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
  // Transform animation hooks
  TransformConflictHook,
  CommitOptions,
} from './core/types.js'
