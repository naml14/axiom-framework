# axiom-framework

> **"The DOM is just the output screen."**

![Axiom logo](./Images/axiom-logo.webp)

A web framework with **two-phase rendering**. All calculations happen in memory. The hot path is pure arithmetic. Zero DOM reads.

[![CI](https://github.com/naml14/axiom-framework/actions/workflows/ci.yml/badge.svg)](https://github.com/naml14/axiom-framework/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/axiom-framework)](https://www.npmjs.com/package/axiom-framework)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Why?

Every time a signal changes, most frameworks re-render and let the browser figure out layout. That means the browser reads the DOM to calculate sizes, then writes back — often multiple times per frame. This is called **layout thrashing**.

Axiom separates the **expensive work** (done once, when data changes) from the **cheap work** (done every frame, when the viewport changes):

```Text
prepare()  → analyze structure, cache metrics         (expensive — once per shape change)
reflow()   → pure arithmetic: positions, sizes        (cheap — every frame, zero DOM reads)
commit()   → batched DOM writes: removes→updates→inserts (final step — write-only)
```

The hot path is **numbers in, numbers out**. No `getBoundingClientRect`. No strings. No allocations.

---

## Installation

```bash
# Bun (recommended)
bun add axiom-framework

# npm
npm install axiom-framework
```

### Quick Start (CLI)

```bash
bunx --package axiom-framework create-axiom my-app
cd my-app
bun dev
```

This scaffolds a complete project with TypeScript, JSX, and a Bun-based dev server. See [docs/COOKBOOK.md](./docs/COOKBOOK.md) for step-by-step recipes.

Or set up manually:

```typescript
import { signal, computed, defineComponent, createApp, stack, h } from 'axiom-framework'

// --- Signals ---
const count = signal(0)
const label = computed(() => `Count: ${count.value}`)

// --- Component ---
const Counter = defineComponent(() =>
  stack({ gap: 8, padding: 16 },
    h('h1', null, label.value),
    h('button', { onClick: () => { count.value++ } }, 'Increment'),
  )
)

// --- Mount ---
const app = createApp(Counter, document.getElementById('app')!)
app.mount()
```

Event props such as `onClick`, `onInput`, and `onChange` wire handlers **declaratively inside the tree** — no `getElementById`, no post-render `addEventListener`. When `count.value` changes, Axiom automatically re-runs `prepare → reflow → commit` in the next animation frame — batching any rapid updates into a single render.

> **Interaction model**: when using the syntax layer, event handlers belong in the component tree via props such as `onClick`, `onInput`, `onChange`, …
> The lower-level `ComponentNode` shape stores normalized handlers under `on`.
> `addEventListener` on `window`, `document`, or external elements is an explicit escape hatch for
> browser-level integration (routing, third-party widgets) — not the default pattern.

---

## Authoring Syntax

Axiom's runtime tree is still `ComponentNode`. The syntax layer is only a safer, shorter way to produce that tree. This matters: JSX and helpers are NOT a second rendering model. They compile down to the same nodes consumed by `prepare → reflow → commit`.

### `h()`, text children, and explicit DOM attrs

```typescript
import { h } from 'axiom-framework'

const node = h('article', {
  class: ['card', 'featured'],
  flex: 'column',
  gap: 8,
  padding: 16,
  attrs: {
    title: 'DOM attribute escape hatch',
    data: { track: 'hero-card' },
  },
},
  h('h2', null, 'Hello'),
  h('p', null, 'Strings and numbers become TextNodes automatically'),
)
```

Use `attrs` when you intentionally need raw DOM attributes that are not part of Axiom's typed prop whitelist. Do NOT reopen a catch-all index signature on props; that is how layout props accidentally leak into the DOM.

### Layout helpers

```typescript
import { stack, row, grid, box } from 'axiom-framework'

stack({ gap: 12, padding: 16 },
  row({ gap: 8, align: 'center' },
    box('strong', null, 'Status'),
    box('span', null, 'Ready'),
  ),
  grid(3, { gap: 10 },
    box({ class: 'tile' }, 'A'),
    box({ class: 'tile' }, 'B'),
    box({ class: 'tile' }, 'C'),
  ),
)
```

These helpers are semantic sugar over `h()`. They produce normal `ElementNode` values and add no extra lifecycle.

### Flow helpers

```typescript
import { For, Show, h } from 'axiom-framework'

const list = For({
  each: products.value,
  keyBy: (product) => product.id,
  children: (product) => h('li', null, product.name),
})

const panel = Show({
  when: user.value !== null,
  fallback: h('a', { href: '/login' }, 'Sign in'),
  children: () => h('span', null, `Hello, ${user.value!.name}`),
})
```

`For`, `Show`, `Switch`, `Match`, and `Each` are pure functions. They do not subscribe to signals. The parent component reads signal values and re-executes; the helpers only build nodes.

### JSX / TSX

JSX is supported through the automatic runtime.

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "axiom-framework"
  }
}
```

Then enable Axiom's JSX types in TSX files or globally in your project:

```tsx
/// <reference types="axiom-framework/jsx-types" />

import { defineComponent, createApp, signal, For, Show } from 'axiom-framework'

const items = signal(['Alpha', 'Beta'])
const visible = signal(true)

function Badge(props: { label: string }) {
  return <span class="badge" padding={4}>{props.label}</span>
}

const App = defineComponent(() => (
  <main flex="column" gap={8} padding={16}>
    <Badge label="JSX" />

    <Show when={visible.value} fallback={<p>No items</p>}>
      <For
        each={items.value}
        keyBy={(item) => item}
        children={(item) => <p>{item}</p>}
      />
    </Show>
  </main>
))

createApp(App, document.getElementById('app')!).mount()
```

Important detail: `keyBy` belongs to `For`. JSX `key` is accepted by the runtime as a special element attribute, but `For({ keyBy })` is the list-key API that Axiom uses to inject stable keys into generated element children.

---

## Architecture

> Updated `src/` hybrid structure (core/reactivity/render/features):
> see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for boundaries, dependency rules,
> and the documented `render/commit.ts -> features/style.ts` exception.

```Text
┌─────────────────────────────────────────────────────────────┐
│                     PUBLIC API                               │
│  signal()  computed()  effect()  defineComponent()  createApp() │
│  buildStatic()  renderToReadableStream()  createServer()       │
│  renderToString()  createRouter()  create-axiom               │
└───────────────────────────┬─────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┬─────────────────┐
         ▼                  ▼                  ▼                 ▼
     reactivity/       render/           app.ts            build.ts
     signals.ts        component.ts      Mount + update     Static site
     Reactive core     Component def     loop + scheduler   generation
     Push + pull       Callable defs     integration        Bun.build()
         │                  │                  │
         ▼                  ▼                  ▼
     render/prepare.ts  render/reflow.ts   render/commit.ts
     Tree analysis      Layout arithmetic   DOM batch writes
     Metrics cache      Fast paths          Diff + apply
            Flex engine + grid
                            │
                            ▼
                     ssr-stream.ts     server.ts
                     Streaming SSR     Server wrapper
                     (ReadableStream)  (Bun.serve)
```

### The Update Cycle

```Text
Signal changes
    │
    ▼
Effect re-runs → component._fn() reads signals (establishes deps)
    │
    ▼
scheduleRender() → batches in rAF (last write wins)
    │
    ▼
performUpdate():
  1. prepare()   → analyze new structure
  2. reflow()    → calculate positions/sizes (pure arithmetic)
  3. commit()    → apply DOM changes (batched, zero reads)
```

---

## API Reference

### Signals

```typescript
// Mutable reactive value
const count = signal(0)
count.value        // read (registers dependency)
count.value = 42   // write (notifies subscribers)

// Derived, read-only value — lazy, cached
const doubled = computed(() => count.value * 2)
doubled.value      // read (re-evaluates only if stale)

// Side effect — runs immediately, re-runs when deps change
const stop = effect(() => {
  console.log('count is', count.value)
  return () => console.log('cleanup')  // optional cleanup
})
stop()  // dispose
```

### Components

```typescript
import { defineComponent } from 'axiom-framework'
import type { ComponentNode } from 'axiom-framework'

const Card = defineComponent((props: { title: string; body: string }) => ({
  type: 'element',
  tag: 'article',
  classes: ['card'],
  layout: { flexDirection: 'column', gap: 8, padding: 16 },
  children: [
    { type: 'element', tag: 'h3',
      children: [{ type: 'text', content: props.title }] },
    { type: 'element', tag: 'p',
      children: [{ type: 'text', content: props.body }] },
  ],
}))

// Components are directly callable — use them in children arrays:
const App = defineComponent(() => ({
  type: 'element',
  tag: 'main',
  children: [
    Card({ title: 'Hello', body: 'World' }),
  ],
}))
```

#### ComponentNode types

```typescript
type ComponentNode = ElementNode | TextNode | FragmentNode | PortalNode

interface ElementNode {
  type: 'element'
  tag: string
  key?: string              // for list reconciliation
  classes?: string[]
  attrs?: Record<string, string>
  on?: Record<string, EventListener>      // event handlers
  style?: SafeStyleProps                  // inline styles with token resolution
  layout?: LayoutProps      // triggers flex layout engine
  children?: ComponentNode[]
}

interface TextNode {
  type: 'text'
  content: string
}

interface FragmentNode {
  type: 'fragment'
  children: ComponentNode[]
}

interface PortalNode {
  type: 'portal'
  target: HTMLElement       // target DOM element for portal
  cssManaged?: boolean      // use CSS transforms instead of relocation
  children: ComponentNode[]
}
```

#### LayoutProps

```typescript
interface LayoutProps {
  display?: 'flex' | 'grid'             // layout mode: flex (default) or grid
  flexDirection?: 'row' | 'column'      // for flex: default is 'column'
  gap?: number                           // gap between children (px)
  columnGap?: number                     // gap between columns (grid)
  rowGap?: number                        // gap between rows (grid)
  justifyContent?: 'start' | 'center' | 'end' | 'space-between'
  alignItems?: 'start' | 'center' | 'end' | 'stretch'
  width?: number | `${number}px` | `${number}%` | `${number}vw` | `${number}vh`
  height?: number | `${number}px` | `${number}%` | `${number}vw` | `${number}vh`
  padding?: number                       // uniform padding (px)
  gridTemplateColumns?: number | `repeat(${number}, 1fr)` // grid columns (MVP)
  gridRowSpan?: number                  // vertical span in grid
  gridColumnSpan?: number               // horizontal span in grid
  breakpoints?: Array<{
    minWidth?: number
    maxWidth?: number
    minHeight?: number
    maxHeight?: number
    layout: Omit<LayoutProps, 'breakpoints'>
  }>
}
```

### App

```typescript
const app = createApp(
  RootComponent,               // ComponentDefinition<void>
  document.getElementById('app')!,
  {
    lineHeight: 20,            // default line height for text (px)
    font: '16px sans-serif',   // font used for text metrics
    hydrate: false,            // reuse server-rendered DOM if available
    strictHydration: false,    // warn (true) or throw on hydration mismatch
    hydrationDebug: false,     // log per-node hydration details
  }
)

app.mount()    // first render + wire reactivity
app.unmount()  // cleanup effects, clear DOM

// Performance metrics from the last render cycle:
const { prepareMs, reflowMs, commitMs } = app.getMetrics()
// Returns { prepareMs: number, reflowMs: number, commitMs: number } in milliseconds
```

---

## Layout Engine

### Fast path vs Flex path

Axiom automatically routes nodes to the most efficient layout algorithm:

| Condition | Path | What it does |
| ----------- | ------ | ------------- |
| No `layout` props + simple children | **Fast path** | Top-to-bottom block layout. No allocations. |
| Has `layout` props (flex/gap/etc.) | **Flex path** | Full flex engine with justify/align/padding. |
| Has `display: 'grid'` | **Grid path** | CSS Grid layout with fixed columns, spans, auto-placement (MVP). |

### Position model

All positions (`x`, `y`) are **relative to the direct parent** — not absolute from the root. The DOM nests children inside parents, and `position: absolute` + `translate()` accumulates naturally.

### Height calculation (bottom-up)

- **Column direction**: height = sum of child heights + gaps
- **Row direction**: height = max of child heights
- Parent without explicit height: calculated automatically from children

---

## Performance Invariants

| Operation | Target | Constraint |
| ----------- | -------- | ------------ |
| `prepare()` per component | < 5ms | Once per shape change |
| `reflow()` per component | < 0.5ms | No DOM, no strings, no allocations |
| `commit()` per update | < 2ms | Sequential writes, zero reads |
| Full hot path (reflow + commit) | < 16ms target | 60fps for trees of ~1000 nodes (not measured in CI) |

> **Note**: Use `app.getMetrics()` to access real timings from the last render cycle: `{ prepareMs: number, reflowMs: number, commitMs: number }` in milliseconds.

### What the hot path NEVER does

```Text
❌ DOM reads  (getBoundingClientRect, offsetHeight, clientWidth)
❌ String operations  (concat, split, template literals)
❌ Unnecessary allocations  (new arrays, temporary objects)
❌ Canvas calls  (measureText)
❌ Anything that forces a browser layout reflow
```

### What the hot path DOES

```Text
✅ Arithmetic on Float32Array
✅ Map/Set lookups
✅ Comparisons
✅ Index access
```

---

## Comparison

| Feature | axiom-framework | React | Vue | Svelte |
| --------- | ---------------- | ------- | ----- | -------- |
| DOM reads in hot path | **0** | Yes (reconciler) | Yes (reconciler) | Minimal |
| Layout algorithm | **In-memory arithmetic** | Browser CSS | Browser CSS | Browser CSS |
| Grid layout | **Native (MVP)** | CSS | CSS | CSS |
| Signals | **Built-in** | useState/Zustand | ref/reactive | Stores |
| Bundle size | **~12KB min / ~4KB gzip** | ~40KB | ~34KB | ~2KB |
| TypeScript | **First-class** | Yes | Yes | Yes |

> **Note**: Axiom started as a low-level layout engine and now supports static site generation, server-side rendering (block + streaming), and a server wrapper. It excels at compute-heavy layouts where precise control over positioning is needed. Bundle size claims not currently verified in CI. Run `bun run build && wc -c dist/index.js` to measure locally.

---

## SSR & Hydration

axiom-framework supports server-side rendering and client rehydration out of the box.

```ts
// server (Node.js / Bun / Edge)
import { renderToString } from 'axiom-framework'

const html = renderToString(MyComponent, {
  width: 1200,
  metadata: { title: 'My App', description: 'Built with axiom' },
})
// → complete <!DOCTYPE html>…</html> string, zero DOM dependency

// client
import { createApp } from 'axiom-framework'

const root = document.getElementById('app')!
const app = createApp(MyComponent, root, {
  hydrate: true,          // reuse server-rendered DOM (no teardown)
  strictHydration: false, // warn on mismatch; set true to throw
  hydrationDebug: false,  // set true to log per-node hydration details
})
app.mount()
```

`renderToString` stamps every element with a `data-axiom-id` marker.
`createApp({ hydrate: true })` uses those markers to reattach event handlers
and reuse existing DOM nodes rather than rebuilding the tree.

See [docs/SSR-HYDRATION-CONTRACT.md](./docs/SSR-HYDRATION-CONTRACT.md) for the
full API reference, runtime/browser matrix, mismatch modes, portal behavior,
and error envelope spec.

If something goes wrong, see [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md).

---

## Static Site Generation

Axiom provides `buildStatic()` — a public API to generate complete static sites with bundled JS minification by default.

```typescript
import { buildStatic, defineComponent, h } from 'axiom-framework'

const Home = defineComponent(() => h('main', null, h('h1', null, 'Hello Static')))

const result = await buildStatic({
  routes: [
    { path: '/', component: Home, metadata: { title: 'My Site' } },
    { path: '/about', component: About, metadata: { title: 'About' } },
  ],
  outDir: './dist',
  minify: true,                      // enabled by default
  assets: {
    entrypoints: ['./src/app.ts'],   // optional JS bundle
  },
})
```

Each route generates an `index.html` with SSR'd content and per-route metadata. JS bundles are compiled via `Bun.build()` with `minify: true` by default. An `asset-manifest.json` is written for CDN deployment.

```bash
# Via CLI (uses buildStatic internally):
bun run build:static
```

## Streaming SSR (experimental)

Axiom supports streaming server-side rendering via Web Streams API.

```typescript
import { renderToReadableStream } from 'axiom-framework'

const stream = renderToReadableStream(MyComponent, {
  metadata: { title: 'Streaming' },
})
// Returns ReadableStream<Uint8Array> — compatible with Response
```

For a complete server with routing, per-route metadata, and static file serving:

```typescript
import { createServer, defineComponent, h } from 'axiom-framework'

const server = createServer({
  routes: [{ path: '/', component: MyPage, metadata: { title: 'Home' } }],
  staticDir: './public',
  port: 3000,
})
server.serve()
// → http://localhost:3000 serves SSR pages + static files
```

> **Note**: Both `renderToReadableStream` and `createServer` are marked `@experimental`. The API may evolve in minor versions before stabilizing in v1.1. Async boundary support (Suspense-like) is planned for a follow-up release.

---

## Limitations

The following features are **not yet supported**:

| Area | Status | Notes |
| ------ | -------- | ----- |
| Async boundaries in streaming SSR | Planned | Synchronous streaming is supported (`@experimental`); Suspense-like boundaries deferred |
| Server wrapper stabilization (`createServer`) | Experimental | Will graduate to `@stable` in v1.1 after community feedback |
| Portal relocation to `document.body` at runtime | Under evaluation | CSS-managed portals are supported via `cssManaged` |
| CSS-in-JS / styled components | Out of scope | Use `style` with the built-in token resolver |
| Accessibility helpers (ARIA wiring, focus management) | Community contribution welcome | Framework primitives are available for external libs |
| i18n / RTL support | Community contribution welcome | Layout engine remains deterministic across directions |

### Fully supported

- **Static site generation**: `buildStatic()` API with bundled JS minification by default (`@stable`)
- **Streaming SSR**: `renderToReadableStream()` via Web Streams API (`@experimental`)
- **Server wrapper**: `createServer()` with Bun.serve, route matching, static files (`@experimental`)
- **Responsive design**: breakpoints (`minWidth`/`maxWidth`), viewport units (`vw`/`vh`), percentages
- **CSS Grid layout (MVP)**: fixed columns, `repeat(...)`, auto-placement, `gridRowSpan`/`gridColumnSpan`
- **Transitions & animations**: per-property transitions coordinated by scheduler
- **SSR-safe router**: static + dynamic route matching with SSR-safe URL parsing
- **Plugin system**: lifecycle hooks (`onMount`, `onUnmount`, `onUpdate`)
- **SSR + hydration**: server rendering and client-side reuse with mismatch handling
- **Syntax v2 authoring layer**: `h()`, text children, layout helpers, flow helpers, and JSX/TSX runtime exports

axiom-framework is a **low-level layout + rendering engine**. Features that belong
in application-level layers will not be added to the core package.

---

## Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for detailed guidelines, architecture constraints, and commit conventions.
Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

```bash
git clone https://github.com/naml14/axiom-framework.git
cd axiom-framework
bun install

bun test                 # run tests (555+ passing)
bun run typecheck        # type check (zero errors)
bun run build            # emit dist/
bun run demo:build       # build demo + static snapshot
bun run demo             # SSR server at http://localhost:3000
bun run build:static     # generate static site via buildStatic()
bunx --package axiom-framework create-axiom my-app  # scaffold new project
```

Tests use [Bun's built-in test runner](https://bun.sh/docs/cli/test) and [Happy DOM](https://github.com/capricorn86/happy-dom) for DOM simulation. Coverage is gated at 85% line coverage (currently **96.5%**).

For practical examples see [docs/COOKBOOK.md](./docs/COOKBOOK.md) (signals, layout, forms, SSR, control flow).

---

## License

[MIT OR Apache-2.0](./LICENSE) © 2026 Nelson Andrés Mora López (naml14)

This project is dual-licensed. Choose either the MIT License or Apache License 2.0.
See [LICENSE](./LICENSE), [LICENSE-MIT](./LICENSE-MIT), and [LICENSE-APACHE](./LICENSE-APACHE) for details.
