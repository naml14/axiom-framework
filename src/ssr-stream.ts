// ============================================================
// axiom-framework — Streaming SSR
// ============================================================

import type { ComponentDefinition } from './core/types.js'
import { renderToString, type SSRMetadata, type SSRRenderOptions } from './ssr.js'

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
 * The current implementation emits a single HTML chunk and then closes the
 * stream. It does not currently support async boundary streaming or
 * replacement updates.
 *
 * @experimental — API may change in minor versions
 */
export function renderToReadableStream(
  component: ComponentDefinition<void>,
  options?: StreamSSROptions
): ReadableStream<Uint8Array> {
  // Current implementation: wrap the full renderToString() result in a
  // ReadableStream as a single chunk.
  const html = renderToString(component, options)
  const encoder = new TextEncoder()

  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(html))
      controller.close()
    },
  })
}

export { type SSRMetadata, type SSRRenderOptions }
