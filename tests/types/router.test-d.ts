import { expectTypeOf } from 'expect-type'
import { defineComponent } from '../../src/render/component.js'
import { createRouter, defineAsyncComponent, type Route, type Router } from '../../src/router.js'
import type { ComponentDefinition } from '../../src/core/types.js'

const Home = defineComponent(() => ({ type: 'fragment', children: [] }))
const User = defineComponent((props: { id: string }) => ({ type: 'text', content: props.id }))

const route: Route = { path: '/', component: Home }
expectTypeOf(route.component).not.toBeAny()
expectTypeOf(route.component).toExtend<ComponentDefinition<unknown>>()

const router = createRouter([
  { path: '/', component: Home },
  { path: '/user/:id', component: User },
])
expectTypeOf(router).toEqualTypeOf<Router>()
expectTypeOf(router.$route.value.matched).toEqualTypeOf<Route | null>()

const AsyncPage = defineAsyncComponent(() => Promise.resolve({ default: Home }))
expectTypeOf(AsyncPage).toEqualTypeOf<ComponentDefinition<void>>()

// @ts-expect-error route component must be an Axiom component definition
const invalidRoute: Route = { path: '/bad', component: {} }
