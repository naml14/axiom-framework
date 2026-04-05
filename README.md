# axiom-framework

> **"The DOM is just the output screen."**

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

---

## Quick Start

```typescript
import { signal, computed, defineComponent, createApp } from 'axiom-framework'

// --- Signals ---
const count = signal(0)
const label = computed(() => `Count: ${count.value}`)

// --- Component ---
const Counter = defineComponent(() => ({
  type: 'element' as const,
  tag: 'div',
  layout: { flexDirection: 'column', gap: 8, padding: 16 },
  children: [
    {
      type: 'element' as const,
      tag: 'h1',
      children: [{ type: 'text' as const, content: label.value }],
    },
    {
      type: 'element' as const,
      tag: 'button',
      attrs: { id: 'increment' },
      children: [{ type: 'text' as const, content: 'Increment' }],
    },
  ],
}))

// --- Mount ---
const app = createApp(Counter, document.getElementById('app')!)
app.mount()

// --- Reactivity ---
document.getElementById('increment')!.addEventListener('click', () => {
  count.value++
})
```

When `count.value` changes, Axiom automatically re-runs `prepare → reflow → commit` in the next animation frame — batching any rapid updates into a single render.

---

## Architecture

```Text
┌─────────────────────────────────────────────────────────────┐
│                     PUBLIC API                               │
│  signal()  computed()  effect()  defineComponent()  createApp() │
└───────────────────────────┬─────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
   signals.ts         component.ts        app.ts
   Reactive core      Component def       Mount + update loop
   Push + pull        Callable defs       Scheduler integration
         │                  │                  │
         ▼                  ▼                  ▼
   prepare.ts         reflow.ts          commit.ts
   Tree analysis      Layout arithmetic  DOM batch writes
   Metrics cache      Fast paths         Diff + apply
                      Flex engine
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
  type: 'element' as const,
  tag: 'article',
  classes: ['card'],
  layout: { flexDirection: 'column', gap: 8, padding: 16 },
  children: [
    { type: 'element' as const, tag: 'h3',
      children: [{ type: 'text' as const, content: props.title }] },
    { type: 'element' as const, tag: 'p',
      children: [{ type: 'text' as const, content: props.body }] },
  ],
}))

// Components are directly callable — use them in children arrays:
const App = defineComponent(() => ({
  type: 'element' as const,
  tag: 'main',
  children: [
    Card({ title: 'Hello', body: 'World' }),
  ],
}))
```

#### ComponentNode types

```typescript
type ComponentNode = ElementNode | TextNode | FragmentNode

interface ElementNode {
  type: 'element'
  tag: string
  key?: string              // for list reconciliation
  classes?: string[]
  attrs?: Record<string, string>
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
```

#### LayoutProps

```typescript
interface LayoutProps {
  flexDirection?: 'row' | 'column'   // default: 'column'
  gap?: number                        // gap between children (px)
  justifyContent?: 'start' | 'center' | 'end' | 'space-between'
  alignItems?: 'start' | 'center' | 'end' | 'stretch'
  width?: number                      // explicit width (px)
  height?: number                     // explicit height (px)
  padding?: number                    // uniform padding (px)
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
  }
)

app.mount()    // first render + wire reactivity
app.unmount()  // cleanup effects, clear DOM

// Performance metrics from the last render cycle:
const { prepareMs, reflowMs, commitMs } = app.getMetrics()
```

---

## Layout Engine

### Fast path vs Flex path

Axiom automatically routes nodes to the most efficient layout algorithm:

| Condition | Path | What it does |
| ----------- | ------ | ------------- |
| No `layout` props + simple children | **Fast path** | Top-to-bottom block layout. No allocations. |
| Has `layout` props (flex/gap/etc.) | **Flex path** | Full flex engine with justify/align/padding. |

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
| Full hot path (reflow + commit) | < 16ms | 60fps for trees of ~1000 nodes |

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
| Masonry layout | **Native** | CSS hack | CSS hack | CSS hack |
| Signals | **Built-in** | useState/Zustand | ref/reactive | Stores |
| Bundle size | **~12KB min / ~4KB gzip** | ~40KB | ~34KB | ~2KB |
| TypeScript | **First-class** | Yes | Yes | Yes |

> **Note**: axiom-framework is a low-level layout engine, not a full-stack application framework. It excels at compute-heavy layouts where precise control over positioning is needed.

---

## Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for detailed guidelines, architecture constraints, and commit conventions.
Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

```bash
git clone https://github.com/naml14/axiom-framework.git
cd axiom-framework
bun install

bun test           # run tests
bun run typecheck  # type check
bun run build      # emit dist/
bun run demo       # run the interactive demo (la demo importa desde ./dist)
```

Tests use [Bun's built-in test runner](https://bun.sh/docs/cli/test) and [Happy DOM](https://github.com/capricorn86/happy-dom) for DOM simulation.

---

## License

[MIT](./LICENSE) © Nelson Andrés Mora López (naml14)
