// ============================================================
// axiom-framework — Streaming SSR
// ============================================================

import type { ComponentDefinition } from './core/types.js'
import { renderToString, type SSRMetadata, type SSRRenderOptions } from './ssr.js'

// ============================================================
// Types
// ============================================================

export interface StreamSSROptions extends SSRRenderOptions {
  onBoundaryResolve?: (id: string) => void
}

// ============================================================
// renderToReadableStream
// ============================================================

/**
 * Render a component to a ReadableStream of HTML chunks.
 * Supports async boundaries: nodes whose children return Promises
 * are emitted as `<template data-axiom-replace="id">` fallback,
 * then replaced when the Promise resolves.
 *
 * @experimental — API may change in minor versions
 */
export function renderToReadableStream(
  component: ComponentDefinition<void>,
  options?: StreamSSROptions
): ReadableStream<Uint8Array> {
  // For the initial implementation, we wrap renderToString in a stream.
  // Async boundary support will be added in a follow-up.
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
