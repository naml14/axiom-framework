#!/usr/bin/env bun

import index from './index.html'

Bun.serve({
  port: 3000,
  routes: {
    '/': index,
  },
  fetch() {
    return new Response('Not Found', { status: 404 })
  },
})

console.log('🚀 Axiom starter dev server → http://localhost:3000')
