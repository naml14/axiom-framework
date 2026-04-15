# SSR & Hydration Contract — axiom-framework v0.2.7

This document defines the contractual behavior of `renderToString` and `commitHydrate`.
It is the authoritative reference for server-side rendering and client hydration.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Runtime & Browser Matrix](#2-runtime--browser-matrix)
3. [`renderToString` API](#3-rendertostring-api)
4. [HTML Output Format](#4-html-output-format)
5. [`commitHydrate` API](#5-commithydrate-api)
6. [Hydration Modes](#6-hydration-modes)
7. [Mismatch Handling](#7-mismatch-handling)
8. [Portal Behavior](#8-portal-behavior)
9. [Error Envelope](#9-error-envelope)
10. [Known Limitations](#10-known-limitations)

---

## 1. Overview

axiom-framework supports a **one-shot SSR + rehydration** model:

```
Server:  renderToString(component, options?) → HTML string
Client:  createApp(root, component, { hydrate: true }) → App
```

The HTML produced by the server contains `data-axiom-id` markers on every
element. The client reads these markers to match virtual nodes to existing DOM
elements instead of creating new ones, preserving server-rendered content and
avoiding a full teardown/rebuild.

**Supported pipeline phases during hydration**

```
prepare → reflow → commitHydrate
                        │
                        ├─ marker scan (getElementsByTagName)
                        ├─ node matching by data-axiom-id
                        ├─ attribute/text verification (soft or strict)
                        ├─ event handler reattachment
                        └─ portal boundary resolution
```

---

## 2. Runtime & Browser Matrix

### Server (SSR)

| Runtime | Status | Notes |
|---------|--------|-------|
| Bun ≥ 1.0 | ✅ Supported | Primary CI target |
| Node.js ≥ 18 | ✅ Supported | Tested via Bun interop |
| Deno | ⚠️ Untested | May work; no CI coverage |
| Cloudflare Workers | ⚠️ Untested | No DOM API needed for `renderToString` |
| Edge (Vercel/Netlify) | ⚠️ Untested | Same note |

`renderToString` has **zero DOM dependency** — it runs in any JS environment.

### Client (Hydration)

| Browser | Status | Notes |
|---------|--------|-------|
| Chrome/Chromium ≥ 95 | ✅ Supported | Primary target |
| Firefox ≥ 90 | ✅ Supported | CI-verified |
| Safari ≥ 15 | ✅ Supported | CI-verified |
| Edge (Chromium) ≥ 95 | ✅ Supported | Same as Chrome |
| IE11 / legacy Edge | ❌ Not supported | No `Float32Array`, no `Map`, no `Set` |
| Mobile Chrome / Safari | ✅ Expected | No verified CI; reports welcome |

### Test Environment

| Tool | Version | Notes |
|------|---------|-------|
| Bun test runner | ≥ 1.0 | Built-in, no Jest needed |
| Happy DOM | ≥ 12.0 | DOM simulation for unit tests |

---

## 3. `renderToString` API

```ts
import { renderToString } from 'axiom-framework'

function renderToString(
  component: ComponentDefinition<void>,
  options?: SSRRenderOptions
): string
```

### `SSRRenderOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `width` | `number` | `800` | Layout canvas width in virtual pixels |
| `height` | `number` | `600` | Layout canvas height in virtual pixels |
| `lineHeight` | `number` | `20` | Base line height for text nodes |
| `font` | `string` | `'16px sans-serif'` | Font descriptor for text measurement |
| `textEngine` | `TextLayoutEngine` | internal | Custom text layout engine |
| `metadata` | `SSRMetadata` | `undefined` | `<head>` metadata injection |
| `url` | `string` | `undefined` | Initial URL (accepted but not used for routing in v0.2.7) |
| `rootId` | `string` | `'app'` | `id` of the root `<div>` in `<body>` |

### `SSRMetadata`

| Option | Type | Description |
|--------|------|-------------|
| `title` | `string` | Sets `<title>` |
| `description` | `string` | Sets `<meta name="description">` |
| `og` | `Record<string, string>` | Sets `<meta property="og:*">` tags |
| `stylesheets` | `string[]` | Injects `<link rel="stylesheet">` tags |
| `inlineStyles` | `string` | Injects a `<style>` block |
| `bodyStyle` | `string` | Sets `style` attribute on `<body>` |

### Guarantees

- Returns a complete, self-contained HTML document (starts with `<!DOCTYPE html>`).
- Deterministic: same input → same output (no timestamps, no randomness).
- All attribute values and text content are HTML-escaped.
- Tag names that fail the `[a-zA-Z][a-zA-Z0-9]*(-[a-zA-Z0-9]+)*` pattern are
  replaced with `div` as a safe fallback.
- Attribute names that fail `[A-Za-z_][\w:.-]*` are omitted entirely.
- Does **not** depend on `window`, `document`, or any browser global.

---

## 4. HTML Output Format

A component with a single button and some text will produce:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
  </head>
  <body>
    <div id="app">
      <div data-axiom-id="0">
        <button data-axiom-id="1">Click me</button>
        <span data-axiom-id="2">Hello</span>
      </div>
    </div>
  </body>
</html>
```

### Marker contract

- Every non-text element receives a `data-axiom-id` attribute.
- Values are **integers starting from 0**, assigned depth-first from the prepare phase.
- `data-axiom-id` values are stable across server and client for the same component
  tree shape — rendering shape changes invalidate markers.
- Text nodes do **not** receive markers; they are matched by parent element position.

### Portal output

Portals produce a `<div>` boundary with two attributes:

```html
<div data-axiom-id="5" data-axiom-portal="portal-5">
  <!-- portal children here -->
</div>
```

The `data-axiom-portal` attribute is used by the client to locate portal boundaries
during hydration and resolve them to the correct `DOMState` slot.

---

## 5. `commitHydrate` API

```ts
import { commitHydrate } from 'axiom-framework'

function commitHydrate(
  layout: LayoutResult,
  prepared: PreparedComponent,
  root: HTMLElement,
  state: DOMState,
  options?: HydrationOptions
): HydrationResult
```

**Typical use via `createApp`** (recommended):

```ts
const root = document.getElementById('app')!
const app = createApp(root, MyComponent, { hydrate: true })
await app.mount()
```

**Advanced / testing use via `commitHydrate` directly:**

```ts
import { prepare } from 'axiom-framework'
import { reflow } from 'axiom-framework/reflow'
import { commitHydrate } from 'axiom-framework'

const p = prepare(MyComponent, undefined, { font: '16px sans-serif' })
const layout = reflow(p, { maxWidth: 800, maxHeight: 600 }, { lineHeight: 20 })
const result = commitHydrate(layout, p, root, state, { strictMismatch: false })
```

### `HydrationOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `strictMismatch` | `boolean` | `false` | Throw on first mismatch instead of warning |
| `skipMissingPortals` | `boolean` | `false` | Warn instead of throw for missing portal markers |
| `debug` | `boolean` | `false` | Emit per-node debug to `console.debug` |

Maps to `createApp` options:
- `hydrate: true` → triggers `commitHydrate` instead of `commitFull`
- `strictHydration: true` → sets `strictMismatch: true`
- `hydrationDebug: true` → sets `debug: true`

### `HydrationResult`

| Field | Type | Description |
|-------|------|-------------|
| `mismatchCount` | `number` | Total nodes where virtual != DOM diverged |
| `hydratedNodeCount` | `number` | Total nodes successfully matched |
| `portalCount` | `number` | Portal boundaries resolved |
| `warnings` | `string[]` | Accumulated warning messages |

A `mismatchCount === 0` result means the DOM exactly matched the virtual tree —
no patching was needed, only event handlers were attached.

---

## 6. Hydration Modes

### Soft mode (default)

`strictHydration: false` / `strictMismatch: false`

- Tag mismatch → warn, **then patch** (replace element content)
- Text mismatch → warn, **then patch**
- Missing portal marker → warn, skip portal
- Attribute mismatch → warn, **then patch attribute**
- Extra DOM nodes → left in place (DOM wins)

Use soft mode in development or when migrating from non-axiom HTML.

### Strict mode

`strictHydration: true` / `strictMismatch: true`

- Any mismatch → **throw `AppError`** with `phase: 'hydrate'`
- The `nodeKey` field in the error context carries the node identifier (currently `undefined`; will be a descriptive key in a future version)
- Portals: `skipMissingPortals` still applies even in strict mode

Use strict mode in production to catch stale HTML caches, CDN mismatch, or
component drift between server and client builds.

### Debug mode

`hydrationDebug: true` / `debug: true`

Emits a `console.debug` line for every node processed:

```
[axiom:hydrate] node 42 matched, tag=div, reused=true
[axiom:hydrate] node 43 mismatch: expected span, found div
```

Can be combined with either soft or strict mode.

---

## 7. Mismatch Handling

A **mismatch** occurs when the virtual node shape does not match the DOM element
found at the expected marker position. Categories:

| Category | Soft behavior | Strict behavior |
|----------|--------------|-----------------|
| Tag name mismatch (`div` vs `span`) | warn + patch | throw |
| Text content mismatch | warn + patch | throw |
| Children count mismatch | warn + patch first N | throw |
| Attribute value mismatch | warn + patch | throw |
| Marker not found in DOM | warn + create | throw |

After `commitHydrate` returns in soft mode, `result.mismatchCount` reflects the
number of nodes that required patching. A non-zero count indicates the SSR HTML
was stale or generated by a different component shape.

---

## 8. Portal Behavior

Portals in axiom-framework are **inline** during SSR — they render as a `<div>`
with `data-axiom-portal` attribute in the regular document flow (not appended to
`document.body` like in some frameworks).

During hydration:
1. `commitHydrate` scans for `[data-axiom-portal]` elements.
2. If found, resolves the portal's children against the marker content.
3. If not found:
   - `skipMissingPortals: false` (default): throws `AppError`
   - `skipMissingPortals: true`: warns, marks portal as unresolved

**Important**: portals are not moved to `document.body` on the client — they
remain in place. If you need portal content in a different DOM position, you
need a post-hydration relocation step (not yet built-in).

---

## 9. Error Envelope

Errors during the hydration lifecycle are wrapped in `AppError`:

```ts
interface AppError extends Error {
  context: AppErrorContext
}

interface AppErrorContext {
  phase: 'prepare' | 'reflow' | 'commit' | 'hydrate'
  nodeKey?: string          // undefined in v0.2.7; populated in future versions
  [key: string]: unknown
}
```

Example in strict mode:

```ts
const app = createApp(root, Component, { hydrate: true, strictHydration: true })
try {
  await app.mount()
} catch (err) {
  if (err instanceof Error && 'context' in err) {
    const ctx = (err as AppError).context
    console.error(`[axiom] error in phase: ${ctx.phase}`)
    // ctx.phase === 'hydrate' (not 'commit') for hydration mismatches
  }
}
```

---

## 10. Known Limitations

| Limitation | Status | Workaround |
|-----------|--------|-----------|
| Router is not SSR-safe | v0.2.7 | Pass `url` to `renderToString`; routing resolved client-side |
| `nodeKey` not yet populated in error context | v0.2.7 | Use `mismatchCount` + `warnings` array to diagnose |
| Portals not relocated to `document.body` on client | v0.2.7 | Manual post-hydration relocation |
| `data-axiom-id` markers are positional, not stable across tree shape changes | by design | Re-render full SSR when component shape changes |
| Text nodes have no marker; matched by parent position | by design | Ensure text node count per parent is deterministic |
| SSR URL routing: `url` option accepted but not applied to route matching | v0.2.7 | Implement client-only routing after hydration |
| `renderToString` does not stream | v0.2.7 | Full string only; streaming planned for v0.3.x |
