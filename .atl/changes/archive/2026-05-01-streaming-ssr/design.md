# Design: Streaming SSR + Server Wrapper

## Technical Approach

Dos módulos nuevos: `src/ssr-stream.ts` con `renderToReadableStream()` y `src/server.ts` con `AxiomServer`. Ambos `@experimental` para v1.0.x. Streaming usa Web Streams API (ReadableStream) nativa de Bun/Node 22.

## Architecture Decisions

### Decision: ReadableStream nativo (no async generator wrapper)
- **Choice**: `renderToReadableStream()` devuelve `ReadableStream<Uint8Array>` directamente
- **Alternatives considered**: AsyncGenerator, callback-based, Node Stream
- **Rationale**: Web Streams API es estándar en Bun, Node 22+, y browsers. Compatible con Response de fetch.

### Decision: Suspense-like via template replacement
- **Choice**: Componentes async emiten un `<template data-axiom-replace="id">` con fallback, luego el chunk de reemplazo viaja en el stream
- **Alternatives considered**: Out-of-order streaming (React), emit chunks out of band
- **Rationale**: Simple de implementar y compatible con hydration cliente. El template replacement es un concepto conocido.

### Decision: AxiomServer como wrapper ligero de Bun.serve
- **Choice**: `AxiomServer` usa `Bun.serve()` internamente, no agrega HTTP server propio
- **Alternatives considered**: Express wrapper, HTTP server propio, Hono adapter
- **Rationale**: Bun.serve() es suficiente para el caso de uso y evita dependencias externas

## Data Flow

```
Streaming SSR:
  renderToReadableStream(component)
    → ReadableStream({
        start(controller) {
          prepare(component) → reflow()
          emit HTML <head> + <body opening
          
          for each async boundary:
            emit <template> fallback
            Promise.all([...boundaries]).then(() => {
              emit replacement chunks
            })
          
          emit </body></html>
          controller.close()
        }
      })

Server:
  AxiomServer.serve()
    → Bun.serve({
        fetch(req) {
          if (static file) → return file
          if (route match) → return renderToReadableStream()
          return 404
        }
      })
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/ssr-stream.ts` | Create | renderToReadableStream() |
| `src/server.ts` | Create | AxiomServer wrapper |
| `src/index.ts` | Modify | Export as @experimental |
| `tests/ssr-stream.test.ts` | Create | Streaming correctness |
| `tests/server.test.ts` | Create | Server integration |

## Interfaces / Contracts

```typescript
// Stream SSR
interface StreamSSROptions extends SSRRenderOptions {
  onBoundaryResolve?: (id: string) => void
}

function renderToReadableStream(
  component: ComponentDefinition<void>,
  options?: StreamSSROptions
): ReadableStream<Uint8Array>

// Server
interface AxiomServerOptions {
  routes: Route[]
  staticDir?: string
  port?: number
  ssr?: StreamSSROptions
}

interface AxiomServer {
  serve(): void
  stop(): void
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Stream produce HTML válido | Collect stream → compare con renderToString |
| Async | Boundaries resuelven en orden | Componentes con Promises simuladas |
| Integration | Server sirve páginas en puerto random | fetch() a Bun.serve() |

## Migration / Rollout

Marcar como `@experimental` en v1.0.0. Pasar a `@stable` en v1.1.0 después de feedback de comunidad.

## Open Questions

- [ ] ¿Soporte inicial para `<Suspense>` como componente o solo boundaries implícitos?