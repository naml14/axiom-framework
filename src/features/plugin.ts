/**
 * @module axiom-framework/plugin
 *
 * Plugin / Adapter hooks for extending Axiom's lifecycle.
 *
 * Plugins are registered before app.mount() and receive lifecycle callbacks.
 * They are designed to be non-intrusive: a failing plugin does not break the
 * prepare → reflow → commit pipeline.
 *
 * Example:
 *
 * ```ts
 * import { createPlugin, registerPlugin } from 'axiom-framework'
 *
 * const devtools = createPlugin({
 *   name: 'axiom-devtools',
 *   onMount: (ctx) => console.log(`App ${ctx.appId} mounted`),
 *   onUpdate: (ctx) => console.log(`App ${ctx.appId} updated`),
 * })
 *
 * registerPlugin(devtools)
 * ```
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Context passed to plugin lifecycle hooks.
 */
export interface PluginContext {
  /** Unique identifier for the app instance */
  appId: string
}

/**
 * Plugin lifecycle hook names.
 */
export type PluginHook = 'onMount' | 'onUnmount' | 'onUpdate'

/**
 * An Axiom plugin definition.
 */
export interface AxiomPlugin {
  /** Unique plugin name. Used to prevent duplicate registration. */
  name: string
  /** Called after the app has been mounted to the DOM. */
  onMount?: (ctx: PluginContext) => void
  /** Called after the app has been unmounted from the DOM. */
  onUnmount?: (ctx: PluginContext) => void
  /** Called after each reactive update cycle completes. */
  onUpdate?: (ctx: PluginContext) => void
}

// ---------------------------------------------------------------------------
// Plugin registry (module-level singleton)
// ---------------------------------------------------------------------------

const _registry: AxiomPlugin[] = []

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a typed plugin definition.
 *
 * Validates that the plugin name is non-empty.
 *
 * @throws {Error} if `name` is an empty string
 */
export function createPlugin<const T extends AxiomPlugin>(config: T): T & AxiomPlugin {
  if (!config.name || config.name.trim().length === 0) {
    throw new Error('Plugin name must be a non-empty string.')
  }
  return { ...config }
}

/**
 * Register a plugin with the global Axiom plugin registry.
 *
 * Plugins with duplicate names are silently ignored.
 *
 * @param plugin - A plugin created with `createPlugin`
 */
export function registerPlugin(plugin: AxiomPlugin): void {
  const alreadyRegistered = _registry.some(p => p.name === plugin.name)
  if (!alreadyRegistered) {
    _registry.push(plugin)
  }
}

/**
 * Returns a copy of the current plugin registry (in registration order).
 */
export function getRegisteredPlugins(): readonly AxiomPlugin[] {
  return [..._registry]
}

/**
 * Clears all registered plugins.
 *
 * Useful in test environments to reset state between test cases.
 */
export function clearPlugins(): void {
  _registry.length = 0
}

/**
 * Invoke a lifecycle hook on all registered plugins that define it.
 *
 * Hooks are called in registration order. If a plugin's hook throws,
 * the error is caught and execution continues with the next plugin,
 * preventing a single plugin failure from breaking the app lifecycle.
 *
 * @param hook - The lifecycle hook name to invoke
 * @param ctx - Context passed to each hook
 */
export function applyPluginHook(hook: PluginHook, ctx: PluginContext): void {
  for (const plugin of _registry) {
    const fn = plugin[hook]
    if (typeof fn === 'function') {
      try {
        fn(ctx)
      } catch {
        // Intentionally swallowed: plugin errors must not break the app lifecycle.
        // Plugin authors can add their own error reporting inside their hooks.
      }
    }
  }
}
