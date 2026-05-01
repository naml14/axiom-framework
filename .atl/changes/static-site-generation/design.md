# Design: Static Site Generation (buildStatic API)

## Technical Approach

API `buildStatic()` en `src/build.ts`. Recibe configuración de rutas, genera HTML con `renderToString()` por ruta, bundlea JS con `Bun.build({minify: true})`, y escribe a disco. Todo en un solo pipeline síncrono/await.

## Architecture Decisions

### Decision: API unificada buildStatic
- **Choice**: `buildStatic({ routes, outDir, basePath, minify, assets })` exportada desde `src/index.ts`
- **Alternatives considered**: CLI separado, plugin de Bun.build, script independiente
- **Rationale**: API programática permite integración en CI/CD. CLI puede wrappearla después.

### Decision: Bun.build como bundler interno
- **Choice**: Usar `Bun.build()` con target browser y minify:true
- **Alternatives considered**: esbuild, rollup, tsc + terser
- **Rationale**: Bun ya es dependencia del proyecto. No agregar bundler externo.

### Decision: HTML por ruta con metadata
- **Choice**: Cada ruta recibe `SSRMetadata` independiente (title, description, og, etc.)
- **Alternatives considered**: Metadata global única
- **Rationale**: SEO necesita metadatos distintos por página. Es el caso de uso principal de SSG.

## Data Flow

```
buildStatic({ routes, outDir })
  │
  ├─ for each route:
  │   ├─ prepare(component) → reflow() → renderToString() → HTML string
  │   └─ writeFile(outDir/route/index.html, HTML)
  │
  ├─ Bun.build({ entrypoints, outDir, minify: true }) → JS bundle(s)
  │
  └─ (opcional) write asset manifest JSON
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/build.ts` | Create | buildStatic() — core pipeline |
| `src/index.ts` | Modify | Export buildStatic y tipos |
| `tests/build.test.ts` | Create | Output validation, HTML correctness |
| `demo/build.ts` | Modify | Refactor para usar buildStatic() |
| `docs/STATIC-BUILD-MINIFICATION.md` | Modify | Update from "proposal" to "implemented" |

## Interfaces / Contracts

```typescript
interface StaticRoute {
  path: string
  component: ComponentDefinition<void>
  metadata?: SSRMetadata
}

interface BuildStaticOptions {
  routes: StaticRoute[]
  outDir: string
  basePath?: string           // default '/'
  minify?: boolean            // default true
  assets?: {
    entrypoints: string[]     // JS entry points
    outDir?: string           // default outDir/assets
  }
}

interface BuildResult {
  routes: number
  files: string[]             // generated file paths
  durationMs: number
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Pipeline con rutas mock | Verify filesystem output |
| Integration | HTML output correctness | Regex/parse HTML de salida |
| Edge | Ruta sin metadata, ruta con caracteres especiales | Sanity checks |

## Migration / Rollout

No migration. Feature nueva y puramente aditiva. Marcar como `@stable` desde el día 1.

## Open Questions

- [ ] ¿Soporte para CSS extraction separado o inline en HTML?