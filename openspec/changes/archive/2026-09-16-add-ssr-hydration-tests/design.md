# Design: Add SSR Hydration Tests

## Technical Approach

Add focused coverage in `tests/ssr-hydration.test.ts` using the existing `happy-dom`, `fakeTextEngine`, and `installWindow` patterns from `tests/hydration.test.ts`. The tests exercise the real SSR→DOM parse→hydration path with `renderToString`, `createApp({ hydrate: true })`/`commitHydrate`, and a deterministic captured scheduler for post-hydration updates. Runtime files remain read-only; only tests and testing documentation change.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Test environment | Use `happy-dom` via local `installWindow(html)` | Real browser, global test setup | Meets constraint, matches existing hydration tests, keeps SSR markup parsing close to current test style. |
| Transform assertions | Assert literal `element.style.transform` and SSR style substrings | Computed styles or CSS variable resolution | `happy-dom` does not execute keyframes or resolve `var()`, so the stable contract is the exact string `translate(Xpx,Ypx) var(--animation-transform)`. |
| Hook scenario | Hydrate SSR markup, then inject conflicting inline `transform` and run captured update | Direct `applyOps` only | Proves the hook in the requested hydration→update cycle while reusing the existing synchronous scheduler capture pattern from `tests/commit.test.ts`. |
| Runtime scope | No changes under `src/` | Patch ownership/hydration behavior | The change is verification-only. Any runtime discrepancy should surface as a failing test for a later behavior change, not be hidden here. |

## Data Flow

SSR/hydration transform contract:

    Component ──renderToString──> HTML string with inline transform
         │                              │
         └──── installWindow(html) ─────┘
                        │
                  commitHydrate/createApp
                        │
              Assert same literal transform

Hydration update conflict hook:

    SSR markup → createApp({ hydrate: true, scheduler, onTransformConflict }).mount()
        → clear baseline hook calls → external transform write → mutate test state
        → run captured scheduled render → assert hook received element + prior transform

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `tests/ssr-hydration.test.ts` | Create | Standalone SSR→hydration tests for transform string preservation and post-hydration `onTransformConflict`. |
| `docs/TESTING-GUIDE.md` | Modify | Add a short “SSR/Hydration Testing” pattern documenting happy-dom limits and literal transform assertions. |
| `src/ssr.ts` | Read | Reference SSR composed transform output. |
| `src/render/commit.ts` | Read | Reference `commitHydrate`, `applyFrameworkLayout`, and conflict hook behavior. |
| `src/app.ts` | Read | Reference hydration mount and scheduler update path. |

## Interfaces / Contracts

No public interfaces change. Tests rely on existing exports from `../src/index.js`:

```ts
renderToString(App, { textEngine })
createApp(App, root, { hydrate: true, scheduler, onTransformConflict, textEngine })
```

Contract under test: framework-managed elements preserve `transform: translate(Xpx,Ypx) var(--animation-transform)` after SSR parsing, hydration, and layout updates.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Integration | SSR markup parses and hydrates with identical composed transform | Render with `renderToString`, load into `happy-dom`, mount/hydrate, assert literal `style.transform`. |
| Integration | `onTransformConflict` fires after hydration on update | Capture scheduler, reset baseline calls after mount, write `scale(...)`, trigger layout-changing update, assert hook args. |
| Docs | Testing pattern is discoverable | Add concise guide section noting no real browser and no computed CSS var assertions. |

## Migration / Rollout

No migration required. Run with the existing `bun test` command.

## Open Questions

None.
