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

---

## 1. Basic Setup

Install test dependencies (already included in `package.json`):

```bash
bun install --save-dev @happy-dom/global-registrator
```

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
  tag: 'div',
  children: [
    { tag: 'h1', text: 'Hello' },
    { tag: 'p', text: 'Welcome to axiom' },
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
  tag: 'div',
  children: [
    { tag: 'span', text: `Count: ${count.get()}` },
    { tag: 'button', text: 'Increment' },
  ],
}))

test('displays signal value', () => {
  const { getByText } = render(Counter)
  expect(getByText(/count: 0/i)).toBeDefined()
})

test('signal changes are reflected', async () => {
  const { getByText, _app } = render(Counter)

  count.set(1)
  // _app.invalidate() triggers re-render
  await _app.mount() // or call invalidate if available

  // After re-render, the text should change
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
  tag: 'button',
  text: clicked.get() ? 'Clicked!' : 'Click me',
  onClick: () => clicked.set(true),
}))

test('button click updates state', () => {
  const { getByText, _app } = render(ClickButton)

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
  tag: 'form',
  children: [
    {
      tag: 'input',
      attrs: { type: 'text', value: inputValue.get() },
      onInput: (e: Event) => {
        const target = e.target as HTMLInputElement
        inputValue.set(target.value)
      },
    },
    {
      tag: 'p',
      text: `You typed: ${inputValue.get()}`,
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

test('component mounts', async () => {
  const { _app } = render(MyComponent)
  await _app.mount()
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
  children: items.get().map(item => ({
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
  isVisible.get()
    ? { tag: 'div', text: 'Visible' }
    : { tag: 'div', text: 'Hidden' }
)

test('shows when signal is true', () => {
  const { getByText } = render(Toggle)
  expect(getByText(/visible/i)).toBeDefined()
})

test('hides when signal is false', () => {
  isVisible.set(false)
  const { getByText } = render(Toggle)
  expect(() => getByText(/visible/i)).toThrow()
})
```

### Testing with computed values

```ts
import { signal, computed, defineComponent } from 'axiom-framework'

const firstName = signal('John')
const lastName = signal('Doe')
const fullName = computed(() => `${firstName.get()} ${lastName.get()}`)

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
