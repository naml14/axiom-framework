// ============================================================
// demo/streaming-page.tsx — Streaming SSR Demo Page
//
// Esta página se sirve desde /ssr-stream usando renderToReadableStream().
// Demuestra el uso de la API experimental para emitir HTML progresivamente.
//
// El core serializa el documento progresivamente según la demanda del lector.
// El endpoint sirve ese stream directamente; la recepción en red puede agrupar
// los chunks. No hay soporte de fronteras asíncronas dentro del árbol.
// ============================================================

/// <reference types="../src/jsx.d.ts" />

import type { ComponentDefinition, ComponentNode } from '../src/index.ts'

/** Página demo que muestra una card con información de streaming SSR. */
export const StreamingDemoPage: ComponentDefinition<void> = (() => {
  function build(): ComponentNode {
    return {
      type: 'element',
      tag: 'main',
      classes: ['ssr-stream-shell'],
      // El CSS inyectado en /ssr-stream sobreescribe position/transform/width/height
      // con !important, así que el inline style del framework queda neutralizado.
      attrs: {
        style: 'position:static;width:100%;height:auto;',
      },
      children: [
        {
          type: 'element',
          tag: 'h1',
          children: [
            { type: 'text', content: '🌀 Streaming SSR Demo' },
            {
              type: 'element',
              tag: 'span',
              classes: ['ssr-stream-chip'],
              children: [{ type: 'text', content: 'streamed' }],
            },
          ],
        },
        {
          type: 'element',
          tag: 'p',
          children: [
            { type: 'text', content: 'Esta página fue servida vía ' },
            { type: 'element', tag: 'code', children: [{ type: 'text', content: 'renderToReadableStream()' }] },
            { type: 'text', content: ' — el endpoint ' },
            { type: 'element', tag: 'code', children: [{ type: 'text', content: '/ssr-stream' }] },
            { type: 'text', content: ' emite el HTML como un ' },
            { type: 'element', tag: 'strong', children: [{ type: 'text', content: 'ReadableStream' }] },
            { type: 'text', content: ' en lugar de una string completa.' },
          ],
        },
        {
          type: 'element',
          tag: 'p',
          classes: ['ssr-stream-muted'],
          children: [
            { type: 'element', tag: 'strong', children: [{ type: 'text', content: 'Estado actual' }] },
            { type: 'text', content: ': el core serializa el documento progresivamente según la demanda del lector. El endpoint sirve ese stream directamente, sin buffering ni delays añadidos. La red puede agrupar los chunks; un documento pequeño puede recibirse en uno solo.' },
          ],
        },
        {
          type: 'element',
          tag: 'p',
          classes: ['ssr-stream-muted'],
          children: [
            { type: 'element', tag: 'strong', children: [{ type: 'text', content: 'Futuro' }] },
            { type: 'text', content: ': las fronteras asíncronas dentro del árbol no están soportadas por esta API.' },
          ],
        },
        { type: 'element', tag: 'hr', children: [] },
        {
          type: 'element',
          tag: 'a',
          attrs: { href: '/' },
          children: [{ type: 'text', content: '← Volver al demo interactivo' }],
        },
      ],
    }
  }

  return {
    _id: Symbol('StreamingDemoPage'),
    _fn: () => build(),
    displayName: 'StreamingDemoPage',
  }
})()
