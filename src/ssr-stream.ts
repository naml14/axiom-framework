// ============================================================
// axiom-framework — Streaming SSR
// ============================================================

import type { ComponentDefinition } from './core/types.js'
import { serializeDocument, type SSRMetadata, type SSRRenderOptions } from './ssr.js'

// ============================================================
// Types
// ============================================================

export interface StreamSSROptions extends SSRRenderOptions {}

// ============================================================
// renderToReadableStream
// ============================================================

/**
 * Render a component to a ReadableStream containing the HTML produced by
 * `renderToString()`.
 *
 * Serializes successive document tokens on demand, without buffering the whole
 * HTML document. Cancellation releases the active pooled layout. Preparation
 * and layout remain synchronous; async boundaries/replacement updates are not
 * supported.
 *
 * @experimental — API may change in minor versions
 */
export function renderToReadableStream(
  component: ComponentDefinition<void>,
  options?: StreamSSROptions
): ReadableStream<Uint8Array> {
  // A valid ComponentDefinition is an object with a callable `_fn`. Note that
  // `defineComponent()` returns a callable function (with `_fn` attached) while
  // `defineAsyncComponent()` returns a plain object — both are valid here, so we
  // must not reject non-callable definitions.
  if (
    component === null ||
    (typeof component !== 'object' && typeof component !== 'function') ||
    typeof (component as ComponentDefinition<void>)._fn !== 'function'
  ) {
    throw new Error('renderToReadableStream() requires a valid component definition')
  }
  const chunks = serializeDocument(component, options)
  const encoder = new TextEncoder()
  let pendingSurrogate = ''

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      try {
        // Adjacent text tokens may split a UTF-16 surrogate pair. Retain only
        // its leading code unit, never an encoded document or subtree buffer.
        while (true) {
          const chunk = chunks.next()
          if (chunk.done) {
            if (pendingSurrogate) controller.enqueue(encoder.encode(pendingSurrogate))
            pendingSurrogate = ''
            controller.close()
            return
          }
          let text = pendingSurrogate + chunk.value
          pendingSurrogate = ''
          const last = text.charCodeAt(text.length - 1)
          if (last >= 0xD800 && last <= 0xDBFF) {
            pendingSurrogate = text.slice(-1)
            text = text.slice(0, -1)
          }
          if (text.length === 0) continue
          controller.enqueue(encoder.encode(text))
          return
        }
      } catch (error) {
        // Also closes the iterator if encoding/enqueuing itself failed.
        pendingSurrogate = ''
        chunks.return()
        controller.error(error)
      }
    },
    cancel() {
      pendingSurrogate = ''
      chunks.return()
    },
  }, { highWaterMark: 0 })
}

export { type SSRMetadata, type SSRRenderOptions }
