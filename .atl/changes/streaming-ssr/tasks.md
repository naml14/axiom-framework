# Tasks: Streaming SSR + Server Wrapper

## Phase 1: Streaming SSR

- [x] 1.1 Create `src/ssr-stream.ts` with `renderToReadableStream()` function signature
- [x] 1.2 Implement synchronous streaming: identical to renderToString but wrapped in ReadableStream
- [ ] 1.3 Implement async boundary detection: nodes returning Promise<ComponentNode>
- [ ] 1.4 Implement fallback emission via `<template data-axiom-replace="id">`
- [ ] 1.5 Implement replacement chunk emission when async boundary resolves
- [x] 1.6 Export from `src/index.ts` as `@experimental`

## Phase 2: Server Wrapper

- [x] 2.1 Create `src/server.ts` with `AxiomServer` class
- [x] 2.2 Integrate `Bun.serve()` — static file serving + route matching + streaming SSR
- [ ] 2.3 Integrate `createRouter()` for client-side route definitions
- [x] 2.4 Add `AxiomServerOptions` — routes, staticDir, port, ssr options
- [x] 2.5 Export from `src/index.ts` as `@experimental`

## Phase 3: Tests

- [x] 3.1 Create `tests/ssr-stream.test.ts` — stream produces valid HTML
- [x] 3.2 Test synchronous stream output matches renderToString
- [ ] 3.3 Test async boundary: fallback emitted, then replacement
- [x] 3.4 Create `tests/server.test.ts` — server starts on random port, serves pages
- [x] 3.5 Test 404 handling, static file serving

## Phase 4: Documentation

- [x] 4.1 Add JSDoc to all public APIs marking @experimental
- [ ] 4.2 Document limitations: partial hydration with streaming boundaries