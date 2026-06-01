// ============================================================
// Plugin / Adapter hooks — unit contracts (TDD red → green)
// Fase 5: Ruta B — Ecosystem Initial
// ============================================================
// Design invariants:
//  - Plugins are registered before app.mount()
//  - Multiple plugins can be registered; they run in registration order
//  - Plugins have optional lifecycle hooks: onMount, onUnmount, onUpdate
//  - Plugins must not break the prepare → reflow → commit pipeline
//  - Plugin registry is global (shared across app instances)
// ============================================================

import { describe, it, expect, beforeEach } from 'bun:test'
import {
  createPlugin,
  registerPlugin,
  getRegisteredPlugins,
  clearPlugins,
  applyPluginHook,
  createAppContext,
} from '../src/features/plugin.js'
import type { AxiomPlugin, PluginContext } from '../src/features/plugin.js'

// ---------------------------------------------------------------------------
// 1. Plugin creation contract
// ---------------------------------------------------------------------------
describe('createPlugin', () => {
  it('creates a plugin with name and empty hooks', () => {
    const plugin = createPlugin({ name: 'my-plugin' })
    expect(plugin.name).toBe('my-plugin')
  })

  it('creates a plugin with all optional hooks', () => {
    const onMount = () => {}
    const onUnmount = () => {}
    const onUpdate = () => {}
    const plugin = createPlugin({ name: 'full-plugin', onMount, onUnmount, onUpdate })
    expect(plugin.onMount).toBe(onMount)
    expect(plugin.onUnmount).toBe(onUnmount)
    expect(plugin.onUpdate).toBe(onUpdate)
  })

  it('plugin name must be a non-empty string', () => {
    expect(() => createPlugin({ name: '' })).toThrow()
  })

  it('creates a plugin with only onMount hook', () => {
    const onMount = () => {}
    const plugin = createPlugin({ name: 'partial-plugin', onMount })
    expect(plugin.onMount).toBe(onMount)
    expect(plugin.onUnmount).toBeUndefined()
  })
})


describe('registerPlugin', () => {
  beforeEach(() => {
    clearPlugins()
  })

  it('registers a plugin and makes it retrievable', () => {
    const plugin = createPlugin({ name: 'plugin-a' })
    registerPlugin(plugin)
    const registered = getRegisteredPlugins()
    expect(registered).toHaveLength(1)
    expect(registered[0]!.name).toBe('plugin-a')
  })

  it('registers multiple plugins in order', () => {
    const a = createPlugin({ name: 'a' })
    const b = createPlugin({ name: 'b' })
    const c = createPlugin({ name: 'c' })
    registerPlugin(a)
    registerPlugin(b)
    registerPlugin(c)
    const names = getRegisteredPlugins().map(p => p.name)
    expect(names).toEqual(['a', 'b', 'c'])
  })

  it('does not register the same plugin name twice', () => {
    const plugin = createPlugin({ name: 'unique' })
    registerPlugin(plugin)
    registerPlugin(plugin)
    expect(getRegisteredPlugins()).toHaveLength(1)
  })

  it('clearPlugins empties the registry', () => {
    registerPlugin(createPlugin({ name: 'x' }))
    clearPlugins()
    expect(getRegisteredPlugins()).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 3. applyPluginHook — calls matching hook in all registered plugins
// ---------------------------------------------------------------------------
describe('applyPluginHook', () => {
  beforeEach(() => {
    clearPlugins()
  })

  it('calls onMount on all plugins that define it', () => {
    const calls: string[] = []
    const ctx: PluginContext = { appId: 'test-app' }

    registerPlugin(createPlugin({ name: 'p1', onMount: (c) => { calls.push('p1:' + c.appId) } }))
    registerPlugin(createPlugin({ name: 'p2', onMount: (c) => { calls.push('p2:' + c.appId) } }))
    registerPlugin(createPlugin({ name: 'p3' }))

    applyPluginHook('onMount', ctx)
    expect(calls).toEqual(['p1:test-app', 'p2:test-app'])
  })

  it('calls onUnmount on all plugins that define it', () => {
    const calls: string[] = []
    const ctx: PluginContext = { appId: 'test-app' }

    registerPlugin(createPlugin({ name: 'p1', onUnmount: () => { calls.push('p1-unmount') } }))
    registerPlugin(createPlugin({ name: 'p2' }))

    applyPluginHook('onUnmount', ctx)
    expect(calls).toEqual(['p1-unmount'])
  })

  it('calls onUpdate on all plugins that define it', () => {
    const calls: string[] = []
    const ctx: PluginContext = { appId: 'test-app' }

    registerPlugin(createPlugin({ name: 'p1', onUpdate: () => { calls.push('update') } }))

    applyPluginHook('onUpdate', ctx)
    expect(calls).toEqual(['update'])
  })

  it('calls hooks in registration order', () => {
    const order: number[] = []
    const ctx: PluginContext = { appId: 'app' }

    registerPlugin(createPlugin({ name: 'first', onMount: () => order.push(1) }))
    registerPlugin(createPlugin({ name: 'second', onMount: () => order.push(2) }))
    registerPlugin(createPlugin({ name: 'third', onMount: () => order.push(3) }))

    applyPluginHook('onMount', ctx)
    expect(order).toEqual([1, 2, 3])
  })

  it('does not throw if no plugins are registered', () => {
    const ctx: PluginContext = { appId: 'empty' }
    expect(() => applyPluginHook('onMount', ctx)).not.toThrow()
  })

  it('continues calling remaining plugins if one throws', () => {
    const calls: string[] = []
    const ctx: PluginContext = { appId: 'app' }

    registerPlugin(createPlugin({
      name: 'thrower',
      onMount: () => { throw new Error('plugin error') }
    }))
    registerPlugin(createPlugin({
      name: 'survivor',
      onMount: () => { calls.push('survived') }
    }))

    applyPluginHook('onMount', ctx)
    expect(calls).toEqual(['survived'])
  })
})

describe('PluginScope (createAppContext)', () => {
  beforeEach(() => {
    clearPlugins()
  })

  it('is re-exported from the package root (documented import path)', async () => {
    // The plugin docs import `createAppContext` from 'axiom-framework'. Guard the
    // public re-export so the documented usage actually works for consumers.
    const root = await import('../src/index.js')
    expect(typeof root.createAppContext).toBe('function')
    const scope = root.createAppContext()
    expect(typeof scope.registerPlugin).toBe('function')
    expect(typeof scope.applyPluginHook).toBe('function')
    expect(typeof scope.getRegisteredPlugins).toBe('function')
  })

  it('creates isolated scopes independent from global registry', () => {
    const globalCalls: string[] = []
    const scopedCalls: string[] = []
    const ctx: PluginContext = { appId: 'scope-app' }

    registerPlugin(createPlugin({
      name: 'global-plugin',
      onMount: () => { globalCalls.push('global') },
    }))

    const scope = createAppContext()
    scope.registerPlugin(createPlugin({
      name: 'scoped-plugin',
      onMount: () => { scopedCalls.push('scoped') },
    }))

    applyPluginHook('onMount', ctx)
    expect(globalCalls).toEqual(['global'])
    expect(scopedCalls).toEqual([])

    scope.applyPluginHook('onMount', ctx)
    expect(scopedCalls).toEqual(['scoped'])
  })

  it('ignores duplicate plugin names inside the same scope', () => {
    const scope = createAppContext()
    const plugin = createPlugin({ name: 'dup' })

    scope.registerPlugin(plugin)
    scope.registerPlugin(plugin)

    expect(scope.getRegisteredPlugins()).toHaveLength(1)
  })

  it('scope hook errors are swallowed and remaining plugins continue', () => {
    const calls: string[] = []
    const scope = createAppContext()
    const ctx: PluginContext = { appId: 'scope-app' }

    scope.registerPlugin(createPlugin({
      name: 'thrower',
      onUpdate: () => { throw new Error('boom') },
    }))
    scope.registerPlugin(createPlugin({
      name: 'survivor',
      onUpdate: () => { calls.push('ok') },
    }))

    expect(() => scope.applyPluginHook('onUpdate', ctx)).not.toThrow()
    expect(calls).toEqual(['ok'])
  })

  it('separate scopes are isolated from each other', () => {
    const scopeA = createAppContext()
    const scopeB = createAppContext()

    scopeA.registerPlugin(createPlugin({ name: 'a' }))
    scopeB.registerPlugin(createPlugin({ name: 'b' }))

    expect(scopeA.getRegisteredPlugins().map(p => p.name)).toEqual(['a'])
    expect(scopeB.getRegisteredPlugins().map(p => p.name)).toEqual(['b'])
  })
})
