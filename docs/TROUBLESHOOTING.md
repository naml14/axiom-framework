# Troubleshooting Guide — axiom-framework

A symptom-first reference. Jump to the section that matches what you're seeing.

---

## Table of Contents

1. [Hydration mismatches](#1-hydration-mismatches)
2. [Empty root after hydration](#2-empty-root-after-hydration)
3. [Portal not rendering / missing](#3-portal-not-rendering--missing)
4. [Signals not updating the UI](#4-signals-not-updating-the-ui)
5. [Performance regression](#5-performance-regression)
6. [TypeScript errors on import](#6-typescript-errors-on-import)
7. [Tests fail with Happy DOM](#7-tests-fail-with-happy-dom)
8. [Error phase is 'commit' instead of 'hydrate'](#8-error-phase-is-commit-instead-of-hydrate)

---

## 1. Hydration mismatches

### Symptoms of Hydration mismatches

- `console.warn` messages like `[axiom:hydrate] mismatch: expected button, found div`
- `result.mismatchCount > 0` after `commitHydrate`
- With `strictHydration: true`: `AppError` thrown with `phase: 'hydrate'`

### Causes & Fixes for Hydration mismatches

**Stale CDN cache**
The server rendered HTML with an older build; the client bundle is newer (or vice versa).

Fix: bust the CDN cache after each deploy, or embed a build hash in the root `<div>` id.

**Component shape diverged between builds**
The server rendered with component A; the client is hydrating with component B (refactored).

Fix: ensure server and client use the **exact same component definition**. Verify that
`data-axiom-id` values in the HTML match what the current `prepare()` produces:

```ts
import { prepare } from 'axiom-framework'
const p = prepare(MyComponent, undefined, { font: '16px sans-serif' })
// p.index values should match data-axiom-id in the HTML
```

**Tree shape is dynamic (conditional rendering driven by client-only state)**
A component shows different nodes based on `window.innerWidth` or `localStorage`.
Server renders generic shape; client renders personalized shape.

Fix: Use soft mode and accept `mismatchCount > 0`, or move conditional branches
outside the component's initial render tree.

**Text content includes server-side timestamps or localized data**
A timestamp rendered on the server is already stale on the client.

Fix: Render timestamps as a separately mounted island (not hydrated, re-rendered fresh).

---

## 2. Empty root after hydration

### Symptoms of Empty root after hydration

- `root.textContent` is `''` after `app.mount()`
- No errors thrown, but the page is blank

### Causes & Fixes for Empty root after hydration

**`hydrate: true` called on an empty root**

If the root element has no server-rendered HTML (e.g. SPA mode with `hydrate: true`),
`commitHydrate` finds zero markers and produces no output. This is not an error — it
silently has nothing to hydrate.

Fix: Either remove `hydrate: true` for client-only apps, or ensure the server renders
HTML before the client boots:

```ts
// SPA — no SSR, just mount
createApp(root, MyComponent)

// With SSR — hydrate into existing HTML
createApp(root, MyComponent, { hydrate: true })
```

**Wrong `rootId`**

Server rendered with `rootId: 'main'` but client mounts into `document.getElementById('app')`.

Fix: Ensure the `rootId` option in `renderToString` matches the `id` of the element
you pass to `createApp`:

```ts
// server
renderToString(MyComponent, { rootId: 'main' })

// client
const root = document.getElementById('main')!
createApp(root, MyComponent, { hydrate: true })
```

**Component returns `null` or throws during prepare**

Fix: Pass an `onError` callback to `createApp` to capture the phase and error details:

```ts
const app = createApp(MyComponent, root, {
  onError(err, context) {
    // context.phase is 'prepare' | 'reflow' | 'commit' | 'hydrate'
    console.error(`Failed during ${context.phase}:`, err)
  },
})
await app.mount()
```

---

## 3. Portal not rendering / missing

### Symptoms of Portal not rendering / missing

- Portal content not visible
- `console.warn` about missing portal marker
- With `skipMissingPortals: false` (default): throws `AppError`

### Causes & Fixes for Portal not rendering / missing

***Portal was added after initial SSR**

The server HTML predates the portal. The client finds no `data-axiom-portal` marker.

Fix: If the portal is new, either re-render server HTML or use `skipMissingPortals: true`
to degrade gracefully on first deploy:

```ts
createApp(root, MyComponent, {
  hydrate: true,
  // not yet supported in v0.2.7 createApp options — use commitHydrate directly:
})

// Advanced:
const result = commitHydrate(layout, p, root, state, { skipMissingPortals: true })
```

***Portal renders but in wrong position**

Portals in axiom-framework are rendered **inline** during SSR (not appended to `body`).
They stay in their virtual tree position in the DOM.

Fix: This is by design in v0.2.7. For portals that need to escape the DOM hierarchy
(e.g. modals rendered at `body` level), implement a post-hydration relocation step.

---

## 4. Signals not updating the UI

### Symptoms of Signals not updating the UI

- `signal.set(newValue)` called but the component does not re-render
- State changes visible in signals but not in DOM

### Causes & Fixes for Signals not updating the UI

***Signal not read inside the component's render function**

axiom signals use pull-based dependency tracking. A signal is only tracked if it is
read during the `prepare` phase.

Fix: Ensure your component reads the signal value inside its definition, not in an
`onClick` handler:

```ts
// ✅ tracked — signal read during prepare
const Counter = () => ({
  tag: 'div',
  children: [{ tag: 'span', text: count.get().toString() }]
})

// ❌ not tracked — signal read only on click
const Counter = () => ({
  tag: 'div',
  onClick: () => console.log(count.get()),
})
```

**`app.mount()` not called**

The scheduler does not start until `mount()` resolves.

***Signal updated from outside the scheduler cycle**

Fix: Trigger updates via event handlers registered through the component tree, or
call `app.invalidate()` after external signal changes (if that API is available in
your version).

---

## 5. Performance regression

### Symptoms of Performance regression

- Frame drops / janky animations
- `benchmark.test.ts` thresholds failing
- `prepare` > 200ms, `reflow` > 100ms, `commit` > 300ms for ~1000 nodes

### Causes & Fixes for Performance regression

***DOM reads introduced in hot path**

The commit phase must contain zero DOM reads. Any call to `getBoundingClientRect`,
`offsetHeight`, `clientWidth`, `getComputedStyle`, or similar APIs inside a signal
subscriber or event handler that triggers synchronously with `commit` will cause
a forced layout reflow.

Fix: Move measurements to a `requestAnimationFrame` callback after commit.

***Text engine running on every cycle**

`prepare()` re-runs the text layout engine on every invalidation. If your component
has many text nodes, ensure that text content is stable (not re-created as new strings).

***Tree too deep (> 5000 nodes)**

axiom is optimized for trees of ~1000 nodes. Very deep trees may exceed the
`prepare < 200ms` threshold.

Fix: Split large trees into independently-mounted sub-apps or use virtualization.

***CI threshold tuning**

If thresholds fail in slow CI environments, adjust `benchmark.test.ts` multipliers
(do not loosen the algorithm; scale the time budget):

```ts
expect(elapsed).toBeLessThan(200 * CI_FACTOR) // where CI_FACTOR = 3 on slow runners
```

---

## 6. TypeScript errors on import

### Symptoms of TypeScript errors on import

- `Module '"axiom-framework"' has no exported member 'commitHydrate'`
- `Cannot find type 'HydrationResult'`
- `Property 'hydrate' does not exist on type 'AppOptions'`

### Causes & Fixes for TypeScript errors on import

***Old version installed**

`commitHydrate`, `HydrationOptions`, `HydrationResult`, `hydrate`, `strictHydration`,
and `hydrationDebug` were all introduced in **v0.2.7**.

Fix: `bun add axiom-framework@^0.2.7`

**`tsconfig.json` does not include `moduleResolution: "bundler"` or `"node16"`**

The package exports are declared in `package.json#exports`. Older `"node"` resolution
ignores the exports map.

Fix: Set `"moduleResolution": "bundler"` (Bun/Vite) or `"node16"` (Node ESM) in
your `tsconfig.json`.

***Importing from the wrong sub-path**

`commitHydrate` is an advanced API re-exported from the main entry point:

```ts
// ✅
import { commitHydrate } from 'axiom-framework'

// ❌ — internal paths are not stable
import { commitHydrate } from 'axiom-framework/src/commit'
```

---

## 7. Tests fail with Happy DOM

### Symptoms of Tests fail with Happy DOM

- `SyntaxError` when calling `document.querySelector` after `document.write`
- `expect(el).toBeInstanceOf(HTMLElement)` fails even though `el` is clearly a DOM node
- 400+ mismatches in hydration tests that should produce 0

### Causes & Fixes for Tests fail with Happy DOM

**`querySelector` after `document.write` in Happy DOM**

Happy DOM does not support `querySelector` on a document that was written with
`document.write`. Use `getElementsByTagName` instead:

```ts
// ❌ throws SyntaxError in happy-dom
const el = document.querySelector('#app')

// ✅
const el = document.getElementsByTagName('div')[0]
// or use the id search:
const el = document.getElementById('app')
```

**`instanceof HTMLElement` across different `Window` instances**

If you create a `new Window()` per test and then call `commitHydrate` on nodes from
a different window, `instanceof` checks fail because each window has its own `HTMLElement`
class.

Fix: Reuse the global `document` provided by Happy DOM's `GlobalRegistrator` rather than
creating a new `Window` per test. Set up once in `beforeAll` and reset content in
`beforeEach`:

```ts
import { GlobalRegistrator } from '@happy-dom/global-registrator'
GlobalRegistrator.register()

let document: Document

beforeAll(() => {
  document = globalThis.document
})

beforeEach(() => {
  document.body.innerHTML = ''
})
```

***Happy DOM version mismatch**

Different versions of `happy-dom` have different `document.write` semantics.
Pin to `>= 12.0.0` in your package.json.

---

## 8. Error phase is `'commit'` instead of `'hydrate'`

### Symptoms

- Catching `AppError` and checking `context.phase`
- Expected `'hydrate'` but got `'commit'`

### Cause

This was a bug in versions **prior to v0.2.7** — `commitHydrate` errors fell
through to the generic `'commit'` catch block.

### Fix

Update to **v0.2.7 or later**. The hydrate path now has its own try/catch that
reports `phase: 'hydrate'` correctly. Example:

```ts
try {
  await app.mount()
} catch (err) {
  const ctx = (err as AppError).context
  if (ctx.phase === 'hydrate') {
    // hydration mismatch in strict mode
  }
  if (ctx.phase === 'commit') {
    // DOM commit error (not a hydration issue)
  }
}
```
