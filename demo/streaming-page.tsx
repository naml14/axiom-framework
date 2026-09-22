// ============================================================
// demo/streaming-page.tsx — Streaming SSR Demo Page
//
// Esta página se sirve desde /ssr-stream usando renderToReadableStream().
// Demuestra el uso de la API experimental para emitir HTML progresivamente.
//
// Nota: la implementación actual de renderToReadableStream emite en un solo
// chunk (ver src/ssr-stream.ts). El endpoint /ssr-stream en demo/server.ts
// hace chunking artificial con delays para visualizar la diferencia entre
// respuesta clásica y streaming.
//
// En una versión futura, renderToReadableStream() podrá emitir múltiples
// chunks (e.g. head primero, body después, o async boundaries) para que
// el navegador pueda empezar a parsear antes de que termine el render.
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
            { type: 'text', content: ': la implementación emite en un solo chunk (ver ' },
            { type: 'element', tag: 'code', children: [{ type: 'text', content: 'src/ssr-stream.ts' }] },
            { type: 'text', content: '). El demo usa un ' },
            { type: 'element', tag: 'em', children: [{ type: 'text', content: 'chunking artificial' }] },
            { type: 'text', content: ' para que puedas ver en DevTools cómo el navegador recibe los chunks progresivamente.' },
          ],
        },
        {
          type: 'element',
          tag: 'p',
          classes: ['ssr-stream-muted'],
          children: [
            { type: 'element', tag: 'strong', children: [{ type: 'text', content: 'Futuro' }] },
            { type: 'text', content: ': async boundaries tipo Suspense permitirán que cada subtree async se emita en su propio chunk cuando termine de cargar.' },
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
