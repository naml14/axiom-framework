# Proposal: Streaming SSR + Server Wrapper

## Intent

Axiom soporta SSR con `renderToString()` pero es single-shot — envía todo el HTML de una vez. Para aplicaciones fullstack reales se necesita streaming SSR (`renderToReadableStream`) que envíe chunks de HTML mientras los datos cargan. Además, un servidor wrapper simplificado (tipo Next.js/Vue minimal) facilita el deployment.

## Scope

### In Scope
- `renderToReadableStream(component, options)` → `ReadableStream`
- Soporte para Suspense-like: boundaries que emiten fallback HTML y luego parches
- AxiomServer: clase que integra router + SSR + static file serving
- Tests de integración streaming

### Out of Scope
- RSC (React Server Components) — paradigma diferente
- Hot module replacement en servidor
- Deploy adapters (Vercel, Cloudflare) — documentar cómo hacerlo

## Capabilities

### New Capabilities
- `streaming-ssr`: Renderizado server-side con streaming y boundaries asíncronos
- `server-wrapper`: Servidor integrado con router + SSR + static files

### Modified Capabilities
- None

## Approach

1. **Streaming**: Crear `src/ssr-stream.ts` con `renderToReadableStream()`. El componente devuelve `ComponentNode | Promise<ComponentNode>`. Los nodos async emiten fallback y luego se reemplazan via `<template>` + `data-axiom-replace`.
2. **Server**: Crear `src/server.ts` con `AxiomServer` que integra router, SSR, y sirve archivos estáticos. Envuelve a `Bun.serve()`.
3. **Export**: Ambos desde `src/index.ts` como `@experimental`

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/ssr-stream.ts` | **Create** | Streaming SSR implementation |
| `src/server.ts` | **Create** | AxiomServer wrapper |
| `src/index.ts` | Modify | Export streaming + server |
| `tests/ssr-stream.test.ts` | **Create** | Streaming tests |
| `tests/server.test.ts` | **Create** | Server integration tests |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Streaming SSR es complejo de implementar correctamente | High | Marcar como @experimental en v1.x; release estable en v1.1+ |
| Incompatibilidad con hydration actual | Medium | Streaming produce HTML diferente (con templates). Separar contractos |
| Rendimiento: overhead de stream vs single-shot | Low | Stream es asíncrono por naturaleza; benchmark vs renderToString |

## Rollback Plan

Streaming y server son módulos nuevos independientes. Se revierten eliminando archivos y exports.

## Dependencies

- v1.0.0 (contrato de estabilidad base)
- `static-site-generation` (reutiliza lógica de build)

## Success Criteria

- [ ] `renderToReadableStream()` devuelve ReadableStream con HTML válido
- [ ] Componentes con datos async emiten fallback → replace
- [ ] `AxiomServer` sirve HTML + JS + static files correctamente
- [ ] Tests: streaming produce mismo output que renderToString para casos síncronos