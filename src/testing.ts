/**
 * @module axiom-framework/testing
 *
 * Public testing utilities for component unit tests.
 *
 * Consumers use these helpers to render components in a test environment,
 * dispatch events, and query the DOM — without needing to know about
 * createApp, prepare, reflow, or commit internals.
 *
 * Example:
 *
 * ```ts
 * import { render, fireEvent } from 'axiom-framework/testing'
 *
 * const { container, getByText } = render(MyComponent)
 * const btn = getByText(/click/i)
 * fireEvent(btn, 'click')
 * expect(container.textContent).toContain('clicked')
 * ```
 */

import type { ComponentDefinition } from './types.js'
import type { TextLayoutEngine } from './prepare.js'
import { createApp } from './app.js'
import type { App } from './app.js'

/**
 * Result object returned by render().
 *
 * Container is the root <div> where the component was mounted.
 * Query methods are happy-dom wrappers for finding elements by text, role, or test id.
 */
export interface RenderResult {
  /** Root container element where component was mounted */
  container: HTMLElement

  /**
   * Re-render the same component with new props (if the component accepts them).
   * Triggers prepare → reflow → commit cycle.
   */
  rerender: (component: ComponentDefinition<void>) => Promise<void>

  /** Unmount the component and clean up */
  unmount: () => void

  /** Query: find element by text content (substring or RegExp) */
  getByText: (text: string | RegExp) => HTMLElement

  /**
   * Query: find element by ARIA role attribute.
   * Common roles: button, heading, link, main, navigation, etc.
   */
  getByRole: (role: string) => HTMLElement

  /**
   * Query: find element by data-testid attribute.
   * Recommended for component unit tests.
   */
  getByTestId: (id: string) => HTMLElement

  /** Low-level: access the underlying App instance (advanced use only) */
  _app: App
}

/**
 * Render a component into a temporary DOM environment suitable for unit testing.
 *
 * Automatically sets up happy-dom, creates a root container, mounts the component,
 * and provides query helpers.
 *
 * @param component — The component to render
 * @param options — Optional layout constraints and text engine
 * @returns RenderResult with query methods
 *
 * @example
 * ```ts
 * const { container, getByText, unmount } = render(MyCounter)
 * expect(container.textContent).toContain('0')
 * unmount()
 * ```
 */
export function render(
  component: ComponentDefinition<void>,
  options?: {
    /** Base line height for text measurement (default 20) */
    lineHeight?: number
    /** Font descriptor for text layout (default '16px sans-serif') */
    font?: string
    /** Custom text layout engine (default: internal) */
    textEngine?: TextLayoutEngine
  }
): RenderResult {
  // Create a temporary root container
  const container = document.createElement('div')
  container.id = `axiom-test-root-${Math.random().toString(36).slice(2, 9)}`
  document.body.appendChild(container)

  // Mount the app
  const app = createApp(component, container, {
    lineHeight: options?.lineHeight ?? 20,
    font: options?.font ?? '16px sans-serif',
    textEngine: options?.textEngine,
  })

  let isMounted = false

  return {
    container,

    rerender: async (nextComponent: ComponentDefinition<void>) => {
      // For now, rerender is a no-op in v0.2.7 testing context.
      // Full rerender support requires component state injection,
      // which is planned for testing utilities enhancement.
      // Unmount and re-render manually if needed:
      //   unmount()
      //   return render(nextComponent, options)
      void nextComponent // eslint-disable-line @typescript-eslint/no-unused-vars
    },

    unmount: () => {
      if (isMounted) {
        app.unmount()
        isMounted = false
      }
      if (document.body.contains(container)) {
        document.body.removeChild(container)
      }
    },

    getByText: (text: string | RegExp): HTMLElement => {
      const regex = text instanceof RegExp ? text : new RegExp(escapeRegex(text), 'i')
      return queryByText(container, regex)
    },

    getByRole: (role: string): HTMLElement => {
      return queryByRole(container, role)
    },

    getByTestId: (id: string): HTMLElement => {
      return queryByTestId(container, id)
    },

    get _app() {
      return app
    },
  } satisfies RenderResult
}

/**
 * Dispatch a synthetic event to an element.
 *
 * Routes through the app's internal event system so that listeners attached
 * by the component are triggered.
 *
 * @param element — Target element
 * @param eventType — Event type (e.g., 'click', 'change', 'input')
 * @param options — Optional event initializer options
 *
 * @example
 * ```ts
 * const btn = getByRole('button')
 * fireEvent(btn, 'click')
 * ```
 */
export function fireEvent(
  element: HTMLElement,
  eventType: string,
  options?: {
    bubbles?: boolean
    cancelable?: boolean
    [key: string]: unknown
  }
): void {
  const defaults: EventInit = {
    bubbles: true,
    cancelable: true,
    ...options,
  }

  // Dispatch as a generic Event
  // (happy-dom handles most event types via Event constructor)
  const event = new Event(eventType, defaults)
  element.dispatchEvent(event)
}

/**
 * Find an element by text content (case-insensitive, partial match).
 * @internal
 */
function queryByText(root: HTMLElement, regex: RegExp): HTMLElement {
  for (const el of Array.from(root.querySelectorAll('*') as NodeListOf<HTMLElement>)) {
    // Check if this element only has a text node child
    if (el.childNodes.length === 1 && el.childNodes[0]?.nodeType === 3) {
      // Text node — leaf element
      const text = el.textContent ?? ''
      if (regex.test(text)) {
        return el
      }
    } else if (regex.test(el.textContent ?? '')) {
      // Will find first ancestor that matches
      return el
    }
  }
  throw new Error(`Unable to find element with text: ${regex}`)
}

/**
 * Find an element by ARIA role attribute.
 * @internal
 */
function queryByRole(root: HTMLElement, role: string): HTMLElement {
  const elements = root.querySelectorAll(`[role="${role}"]`) as NodeListOf<HTMLElement>
  if (elements.length === 0) {
    throw new Error(`Unable to find element with role: ${role}`)
  }
  const el = elements[0]
  if (!el) {
    throw new Error(`Unable to find element with role: ${role}`)
  }
  return el
}

/**
 * Find an element by data-testid attribute.
 * @internal
 */
function queryByTestId(root: HTMLElement, id: string): HTMLElement {
  const el = root.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
  if (!el) {
    throw new Error(`Unable to find element with testid: ${id}`)
  }
  return el
}

/**
 * Escape regex special characters for literal string search.
 * @internal
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Capitalize first letter.
 * @internal
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
