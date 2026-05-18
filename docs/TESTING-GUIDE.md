# Testing Guide — axiom-framework

How to write unit tests for components using the public `render()` and `fireEvent()` helpers.

---

## Table of Contents

1. [Basic Setup](#1-basic-setup)
2. [Simple Component Test](#2-simple-component-test)
3. [Testing Signals & State](#3-testing-signals--state)
4. [Testing Event Handlers](#4-testing-event-handlers)
5. [Querying Elements](#5-querying-elements)
6. [Testing Portals](#6-testing-portals)
7. [Testing with Async Lifecycle](#7-testing-with-async-lifecycle)
8. [Common Patterns](#8-common-patterns)
9. [Debugging Tips](#9-debugging-tips)
10. [SSR / Hydration Testing](#10-ssr--hydration-testing)

---

## 1. Basic Setup

Install test dependency:

```bash
bun install --save-dev @happy-dom/global-registrator
```

> Nota: este repositorio usa `happy-dom` directamente en tests internos. Si prefieres
> registrar globals automáticamente en tus tests de consumidor, agrega
> `@happy-dom/global-registrator` como dependencia de desarrollo.

Create a test file:

```ts
// my-component.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { render, fireEvent } from 'axiom-framework/testing'
import { MyComponent } from './my-component.ts'

describe('MyComponent', () => {
  // tests here
})
```

---

## 2. Simple Component Test

### Testing static markup

```ts
import { defineComponent } from 'axiom-framework'
import { render } from 'axiom-framework/testing'

const Greeting = defineComponent(() => ({
  type: 'element',
  tag: 'div',
  children: [
    { type: 'element', tag: 'h1', children: [{ type: 'text', content: 'Hello' }] },
    { type: 'element', tag: 'p', children: [{ type: 'text', content: 'Welcome to axiom' }] },
  ],
}))

test('renders greeting', () => {
  const { container, getByText } = render(Greeting)

  expect(container.textContent).toContain('Hello')
  const heading = getByText(/hello/i)
  expect(heading.tagName).toBe('H1')
})
```

### After test cleanup

```ts
test('renders and cleans up', () => {
  const { container, unmount } = render(Greeting)
  expect(document.body.contains(container)).toBe(true)

  unmount()
  expect(document.body.contains(container)).toBe(false)
})
```

---

## 3. Testing Signals & State

### Testing reactive updates

```ts
import { signal, defineComponent } from 'axiom-framework'
import { render } from 'axiom-framework/testing'

const count = signal(0)
const Counter = defineComponent(() => ({
  type: 'element',
  tag: 'div',
  children: [
    { type: 'element', tag: 'span', children: [{ type: 'text', content: `Count: ${count.value}` }] },
    { type: 'element', tag: 'button', children: [{ type: 'text', content: 'Increment' }] },
  ],
}))

test('displays signal value', () => {
  const { getByText } = render(Counter)
  expect(getByText(/count: 0/i)).toBeDefined()
})

test('signal changes are reflected', () => {
  const { getByText } = render(Counter)

  count.value = 1

  // After scheduler flush, the text should change
  expect(getByText(/count: 1/i)).toBeDefined()
})
```

---

## 4. Testing Event Handlers

### Testing click handlers

```ts
import { signal, defineComponent } from 'axiom-framework'
import { render, fireEvent } from 'axiom-framework/testing'

const clicked = signal(false)
const ClickButton = defineComponent(() => ({
  type: 'element',
  tag: 'button',
  on: { click: () => { clicked.value = true } },
  children: [{ type: 'text', content: clicked.value ? 'Clicked!' : 'Click me' }],
}))

test('button click updates state', () => {
  const { getByText } = render(ClickButton)

  const btn = getByText(/click me/i)
  fireEvent(btn, 'click')

  // After event, the signal was updated and component re-rendered
  // (This model depends on your app's event batching; adjust as needed)
})
```

### Testing form inputs

```ts
const inputValue = signal('')
const Form = defineComponent(() => ({
  type: 'element',
  tag: 'form',
  children: [
    {
      type: 'element',
      tag: 'input',
      attrs: { type: 'text', value: inputValue.value, 'data-testid': 'form-input' },
      on: {
        input: (e: Event) => {
          const target = e.target as HTMLInputElement
          inputValue.value = target.value
        },
      },
    },
    {
      type: 'element',
      tag: 'p',
      children: [{ type: 'text', content: `You typed: ${inputValue.value}` }],
    },
  ],
}))

test('input fires onInput handler', () => {
  const { getByTestId } = render(Form)

  const input = getByTestId('form-input') as HTMLInputElement
  input.value = 'hello'
  fireEvent(input, 'input')

  // Verify the signal was updated (check view or signal directly)
})
```

---

## 5. Querying Elements

### `getByText()`

Find an element by text content, case-insensitive, partial match:

```ts
const { getByText } = render(MyComponent)

// ✅ All of these work:
getByText('click me')
getByText(/click me/i)
getByText(/click/)

// ❌ Throws if element not found:
getByText('does not exist') // Error: Unable to find element with text
```

### `getByRole()`

Find an element by ARIA role attribute:

```ts
const { getByRole } = render(MyComponent)

// ✅
getByRole('button')
getByRole('heading')
getByRole('navigation')
getByRole('main')
```

Set role in your component:

```ts
const MyButton = defineComponent(() => ({
  tag: 'div',
  attrs: { role: 'button', onClick: handleClick },
  text: 'Click me',
}))
```

### `getByTestId()`

Find an element by `data-testid` attribute — **recommended for unit tests**:

```ts
const { getByTestId } = render(MyComponent)

// ✅
getByTestId('submit-button')
getByTestId('user-list')
```

Set the attribute in your component:

```ts
const SubmitButton = defineComponent(() => ({
  tag: 'button',
  attrs: { 'data-testid': 'submit-button' },
  text: 'Submit',
}))
```

### Accessing the raw container

```ts
const { container } = render(MyComponent)

// Direct DOM access if needed
const allDivs = container.querySelectorAll('div')
console.log(allDivs.length)
```

---

## 6. Testing Portals

### Portal content isolation

```ts
import { createPortal, defineComponent } from 'axiom-framework'
import { render } from 'axiom-framework/testing'

const Modal = defineComponent(() =>
  createPortal(
    {
      tag: 'div',
      attrs: { role: 'dialog' },
      children: [
        { tag: 'h2', text: 'Modal Title' },
        { tag: 'p', text: 'Modal content' },
      ],
    },
    'modals'
  )
)

test('portal renders content', () => {
  const { getByRole } = render(Modal)
  const dialog = getByRole('dialog')
  expect(dialog).toBeDefined()
})
```

---

## 7. Testing with Async Lifecycle

### Waiting for mount

```ts
import { render } from 'axiom-framework/testing'

test('component mounts', () => {
  const { _app } = render(MyComponent)
  _app.mount()
  // Component is mounted and ready
})

test('unmount completes', () => {
  const { unmount } = render(MyComponent)
  unmount()
  // Component is unmounted
})
```

---

## 8. Common Patterns

### Testing a list component

```ts
const items = signal(['apple', 'banana', 'cherry'])
const ShoppingList = defineComponent(() => ({
  tag: 'ul',
  children: items.value.map(item => ({
    tag: 'li',
    text: item,
    attrs: { 'data-testid': `item-${item}` },
  })),
}))

test('lists all items', () => {
  const { getByTestId } = render(ShoppingList)
  expect(getByTestId('item-apple')).toBeDefined()
  expect(getByTestId('item-banana')).toBeDefined()
})
```

### Testing conditional rendering

```ts
const isVisible = signal(true)
const Toggle = defineComponent(() =>
  isVisible.value
    ? { tag: 'div', text: 'Visible' }
    : { tag: 'div', text: 'Hidden' }
)

test('shows when signal is true', () => {
  const { getByText } = render(Toggle)
  expect(getByText(/visible/i)).toBeDefined()
})

test('hides when signal is false', () => {
  isVisible.value = false
  const { getByText } = render(Toggle)
  expect(() => getByText(/visible/i)).toThrow()
})
```

### Testing with computed values

```ts
import { signal, computed, defineComponent } from 'axiom-framework'

const firstName = signal('John')
const lastName = signal('Doe')
const fullName = computed(() => `${firstName.value} ${lastName.value}`)

const GreetingCard = defineComponent(() => ({
  tag: 'div',
  text: `Hello, ${fullName.get()}`,
}))

test('computed value is live', () => {
  const { getByText } = render(GreetingCard)
  expect(getByText(/hello, john doe/i)).toBeDefined()
})
```

---

## 9. Debugging Tips

### Inspect the full DOM

```ts
const { container } = render(MyComponent)
console.log(container.outerHTML) // prints the entire rendered tree
```

### Use `_app` for advanced inspection

```ts
const { _app } = render(MyComponent)
const metrics = _app.getMetrics()
console.log('Prepare time:', metrics.prepareMs)
console.log('Reflow time:', metrics.reflowMs)
console.log('Commit time:', metrics.commitMs)
```

### Check for event listener attachment

```ts
const Click = defineComponent(() => ({
  tag: 'button',
  text: 'Click',
  onClick: () => console.log('clicked'),
}))

test('button has listener', () => {
  const { getByText } = render(Click)
  const btn = getByText('Click') as HTMLElement

  // In happy-dom, listeners are stored on the element:
  console.log(btn._listeners) // internal happy-dom property
})
```

### Suppress console output during tests

```ts
const originalWarn = console.warn
beforeEach(() => {
  console.warn = () => {} // silence warnings during test
})
afterEach(() => {
  console.warn = originalWarn
})
```

---

## FAQ

**Q: Can I test the full render → reflow → commit pipeline?**

A: Yes. `render()` automatically calls `createApp` and returns `_app` for advanced use:

```ts
const result = render(MyComponent)
const metrics = result._app.getMetrics()
console.log(`Full cycle: ${metrics.prepareMs + metrics.reflowMs + metrics.commitMs}ms`)
```

**Q: How do I test SSR + hydration?**

A: Use the lower-level `renderToString` + `commitHydrate` directly (not `render()`).
See [docs/SSR-HYDRATION-CONTRACT.md](./SSR-HYDRATION-CONTRACT.md) for the contract.

**Q: Can I mock `TextLayoutEngine`?**

A: Yes. Pass it to `render()`:

```ts
const mockTextEngine = {
  prepare: (text: string) => ({ ... }),
  layout: (_p, maxWidth, _lh) => ({ lineCount: 1, height: 20 }),
  clearCache: () => {},
}

render(MyComponent, { textEngine: mockTextEngine })
```

**Q: How do I test error handling?**

A: Wrap `render()` in try/catch or use `expect(() => render(...)).toThrow()`:

```ts
const BadComponent = defineComponent(() => {
  throw new Error('Intentional error')
})

test('handles component error', () => {
  expect(() => render(BadComponent)).toThrow()
})
```

## Coverage Gate

Axiom enforces a global **85% minimum line coverage** gate in CI.

### Run the same gate locally

```bash
bun run test:coverage
```

What this command does:

- Runs `bun test --coverage` once from the repository root.
- Parses the final `All files` / `% Lines` summary emitted by Bun.
- Fails clearly if tests fail, if the coverage summary cannot be parsed, or if line coverage drops below `85%`.

CI uses the same command, so local output should match the workflow behavior.

---

## 10. SSR / Hydration Testing

Axiom's SSR-to-hydration pipeline can be tested using `happy-dom` without a real browser.
This section documents the patterns, the key limits of `happy-dom`, and why assertions must
use literal string values instead of computed CSS.

### Key constraints of happy-dom

| Constraint | Implication |
|------------|-------------|
| Does **not** execute CSS keyframes | `--animation-transform` CSS variable is never resolved to a concrete value |
| Does **not** compute `var()` references | `style.transform` returns the literal string, e.g. `translate(0px,0px) var(--animation-transform)` |
| `document.write(html)` parses and loads the HTML | Use this to install SSR markup before hydrating |

Because `var()` is never resolved, **all transform assertions must match the exact literal string**:

```ts
// ✅ correct — asserts the literal composed transform
expect(el.style.transform).toMatch(/^translate\(\d+px,\d+px\) var\(--animation-transform\)$/)

// ❌ wrong — happy-dom never resolves var() so this will never match
expect(el.style.transform).toContain('rotate(45deg)')
```

### SSR → hydrate flow

```ts
import { Window } from 'happy-dom'
import { defineComponent, renderToString, prepare, reflow, commitHydrate } from 'axiom-framework'

const fakeTextEngine = { /* ... */ }

function installWindow(html?: string) {
  const win = new Window()
  globalThis.window = win as unknown as typeof globalThis.window
  globalThis.document = win.document as unknown as Document
  globalThis.HTMLElement = win.HTMLElement as unknown as typeof HTMLElement
  globalThis.Text = win.Text as unknown as typeof Text
  if (html) win.document.write(html)
  return win
}

test('hydrated element preserves composed transform', () => {
  const App = defineComponent(() => ({
    type: 'element' as const,
    tag: 'div',
    children: [{ type: 'text' as const, content: 'Hi' }],
  }))

  // 1. Render to HTML on the "server"
  const html = renderToString(App, { textEngine: fakeTextEngine })

  // 2. Load into happy-dom (simulates browser receiving SSR markup)
  installWindow(html)
  const root = document.getElementById('app') as HTMLElement

  // 3. Hydrate
  const prepared = prepare(App, undefined, { textEngine: fakeTextEngine })
  const layout = reflow(prepared, { maxWidth: 800, maxHeight: 600 }, { lineHeight: 20 })
  const state = { domNodes: [] as Array<HTMLElement | Text | null>, portalRoots: new Map() }
  commitHydrate(layout, prepared, root, state, { strictMismatch: true })

  // 4. Assert the literal composed transform — both layout slot and animation slot present
  const el = root.firstElementChild as HTMLElement
  expect(el.style.transform).toMatch(/^translate\(\d+px,\d+px\) var\(--animation-transform\)$/)
})
```

### Testing `onTransformConflict` after hydration

Use a synchronous capturing scheduler to control when `performUpdate` runs. This lets you
inject a conflicting transform after hydration but before the next update cycle.

> **Note**: The `onTransformConflict` hook also fires during `commitHydrate` itself for SSR
> elements whose `transform` was written by the server (the client-side Axiom instance has
> not yet "owned" that value). If you want to assert only **post-hydration** conflicts,
> reset your call collector after `app.mount()`.

```ts
import { createApp } from 'axiom-framework'

test('onTransformConflict fires on post-hydration update', () => {
  let labelText = 'Hello'
  const App = defineComponent(() => ({
    type: 'element' as const,
    tag: 'div',
    children: [{ type: 'text' as const, content: labelText }],
  }))

  const html = renderToString(App, { textEngine: fakeTextEngine })
  installWindow(html)
  const root = document.getElementById('app') as HTMLElement

  const conflictCalls: Array<{ el: HTMLElement; transform: string }> = []
  let scheduledRender: (() => void) | null = null

  const app = createApp(App, root, {
    textEngine: fakeTextEngine,
    hydrate: true,
    scheduler: (fn) => { scheduledRender = fn },
    onTransformConflict: (el, t) => conflictCalls.push({ el: el as HTMLElement, transform: t }),
  })

  app.mount()

  // Reset baseline — hook fires once during commitHydrate for the SSR-written transform.
  // Clear it to test only the post-hydration update scenario.
  conflictCalls.length = 0

  const child = root.firstElementChild as HTMLElement
  // Simulate an animation library writing to `transform` instead of `--animation-transform`
  child.style.transform = 'scale(0.9)'

  // Force a layout change so fullDiff emits a layout update op
  labelText = 'Hello'.repeat(50)
  scheduledRender!()

  expect(conflictCalls.length).toBe(1)
  expect(conflictCalls[0]!.transform).toBe('scale(0.9)')

  app.unmount()
})
```
