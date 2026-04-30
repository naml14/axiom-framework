import { expectTypeOf } from 'expect-type'
import { signal } from '../../src/reactivity/signals.js'
import { createContext, createStore, injectStore, provideStore, useContext, withContext, type Context, type StoreInstance } from '../../src/features/context.js'
import type { Signal } from '../../src/core/types.js'

const stringContext = createContext<string>('default')
expectTypeOf(stringContext).toEqualTypeOf<Context<string>>()
expectTypeOf(useContext(stringContext)).toEqualTypeOf<Signal<string>>()
withContext(stringContext, 'provided', () => undefined)
withContext(stringContext, signal('provided'), () => undefined)
// @ts-expect-error provider value must not widen Context<string> to include number
withContext(stringContext, 123, () => undefined)
// @ts-expect-error provider signal must match the context value type
withContext(stringContext, signal(123), () => undefined)

const literalContext = createContext('light')
expectTypeOf(literalContext).toEqualTypeOf<Context<'light'>>()
withContext(literalContext, 'light', () => undefined)
// @ts-expect-error literal contexts reject other literals unless explicitly widened
withContext(literalContext, 'dark', () => undefined)

const store = createStore({ count: 0 })
expectTypeOf(store).toEqualTypeOf<StoreInstance<{ count: number }>>()
expectTypeOf(store.state).toEqualTypeOf<Signal<{ count: number }>>()
provideStore(store, () => undefined)
expectTypeOf(injectStore(store)).toEqualTypeOf<StoreInstance<{ count: number }>>()
