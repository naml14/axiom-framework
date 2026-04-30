import { expectTypeOf } from 'expect-type'
import { computed, effect, signal } from '../../src/reactivity/signals.js'
import type { ComputedSignal, Signal } from '../../src/core/types.js'

const count = signal(1)
expectTypeOf(count).toEqualTypeOf<Signal<number>>()
expectTypeOf(count.value).toEqualTypeOf<number>()
count.value = 2
// @ts-expect-error signal values keep their inferred type
count.value = '2'

const name = signal('Axiom')
expectTypeOf(name.value).toEqualTypeOf<string>()

const doubled = computed(() => count.value * 2)
expectTypeOf(doubled).toEqualTypeOf<ComputedSignal<number>>()
expectTypeOf(doubled.value).toEqualTypeOf<number>()
// @ts-expect-error computed values are read-only at the type level
doubled.value = 4

const dispose = effect(() => {
  count.value
})
expectTypeOf(dispose).toEqualTypeOf<() => void>()

const disposeWithCleanup = effect(() => () => {
  count.value
})
expectTypeOf(disposeWithCleanup).toEqualTypeOf<() => void>()
