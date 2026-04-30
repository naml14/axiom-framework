import { expectTypeOf } from 'expect-type'
import { createPlugin, type AxiomPlugin, type PluginContext } from '../../src/features/plugin.js'

const plugin = createPlugin({ name: 'axiom-devtools' })
expectTypeOf(plugin.name).toEqualTypeOf<'axiom-devtools'>()
expectTypeOf(plugin).toExtend<AxiomPlugin>()

const pluginWithHooks = createPlugin({
  name: 'full-plugin',
  onMount(ctx: PluginContext) {
    ctx.appId
  },
})
expectTypeOf(pluginWithHooks.name).toEqualTypeOf<'full-plugin'>()
expectTypeOf(pluginWithHooks.onMount).toEqualTypeOf<(ctx: PluginContext) => void>()

declare function pluginKey<const T extends AxiomPlugin>(plugin: T): T['name']
const key = pluginKey(plugin)
expectTypeOf(key).toEqualTypeOf<'axiom-devtools'>()

declare function createPluginRegistry<const T extends readonly AxiomPlugin[]>(
  plugins: T
): { [K in T[number]['name']]: Extract<T[number], { name: K }> }
const registry = createPluginRegistry([plugin, pluginWithHooks] as const)
expectTypeOf(registry['axiom-devtools'].name).toEqualTypeOf<'axiom-devtools'>()
expectTypeOf(registry['full-plugin'].name).toEqualTypeOf<'full-plugin'>()

// @ts-expect-error plugin name is required
createPlugin({})
// @ts-expect-error hook context must be compatible with PluginContext
createPlugin({ name: 'bad-hook', onMount(ctx: { appId: number }) { ctx.appId } })
