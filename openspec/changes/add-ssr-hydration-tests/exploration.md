# Exploration: add-ssr-hydration-tests

## Current State

The `fix-css-transform-animations` verify report issued a **PASS WITH WARNINGS** verdict. The
two unresolved warnings are:

1. `fill-mode: both` and `fill-mode: forwards` tests in `tests/commit.test.ts` are
   **PARTIAL** — they prove the composed-transform contract and Axiom's re-render behavior,
   but they do not exercise CSS animation fill-mode semantics because happy-dom does not
   resolve `var()` custom properties or run animation keyframes.
2. No test file exercises the complete **SSR → serialize HTML → hydrate → interact** cycle for
   transform-related behaviors.

### Existing test structure

| File | What it covers | Gap |
|------|---------------|-----|
| `tests/ssr.test.ts` | `renderToString` output shape, escaping, metadata, SSR transform string format | No hydration; no animation interaction |
| `tests/hydration.test.ts` | `commitHydrate` mismatch detection, marker matching, portal handling | No transform assertions; no conflict hook |
| `tests/commit.test.ts` | `applyOps`, composed transform, `onTransformConflict`, fill-mode units (partial) | Not a real SSR→hydrate cycle; fill-mode is simulated |
| `tests/animation.test.ts` | Framework animation/transition API (`createTransition`, `scheduleTransition`) | Unrelated to SSR/hydration |

There is **no unified SSR→HTML→hydrate→interact harness**.

### What happy-dom can and cannot do

| Capability | happy-dom verdict | Notes |
|------------|------------------|-------|
| Parse HTML via `document.write()` / `innerHTML` | ✅ Yes | Used in `hydration.test.ts` |
| `style.transform` read/write | ✅ Yes | Used in `commit.test.ts` |
| CSS custom property `setProperty` / `getPropertyValue` | ✅ Yes | Used in `commit.test.ts` fill-mode tests |
| `style.getPropertyPriority('transform')` | ✅ Yes | Used in `commit.test.ts` |
| Compute / resolve `var(--animation-transform)` in inline style | ❌ No | Browser-only; happy-dom keeps the literal `var()` string |
| Execute CSS `@keyframes` fill-mode animation | ❌ No | Browser-only |
| `dispatchEvent` + event listeners | ✅ Yes | Used in `hydration.test.ts` |
| `commitHydrate` after `renderToString` | ✅ Yes | Used in `hydration.test.ts` |
| `createApp({ hydrate: true })` | ✅ Yes | `src/app.ts` supports it |

### Key invariants to prove via the new harness

1. **SSR/client transform parity**: `renderToString` emits `translate(Xpx,Ypx) var(--animation-transform)` and `commitHydrate` writes the same string to the element's inline `style.transform`.
2. **`--animation-transform` CSS var survives SSR→hydrate**: After hydration, setting `el.style.setProperty('--animation-transform', 'scale(0.9)')` and triggering a re-render preserves the var composition in the new transform string.
3. **`onTransformConflict` fires in a real hydration cycle**: After `commitHydrate`, if user code sets an inline transform directly (not `--animation-transform`), the next `applyOps` update fires the hook before overwriting.
4. **`createApp({ hydrate: true, onTransformConflict })` end-to-end wiring**: Mount via SSR HTML, hydrate via `createApp`, set a conflicting inline transform, trigger update, assert hook fires.

## Affected Areas

- `tests/ssr-hydration.test.ts` — new file (create)
- `docs/TESTING-GUIDE.md` — extend with SSR/hydration testing patterns (scope says `docs/TESTING.md` but the actual file in the repo is `docs/TESTING-GUIDE.md`)
- `src/ssr.ts` — read-only reference for transform contract
- `src/render/commit.ts` — read-only reference for `commitHydrate` + `onTransformConflict`
- `src/app.ts` — read-only reference for `createApp({ hydrate, onTransformConflict })`

> ⚠️ **Scope clarification needed**: the intake scope says `docs/TESTING.md` but the project's
> testing guide lives at `docs/TESTING-GUIDE.md`. The exploration recommends updating the
> existing file. Confirm before spec.

## Approaches

### 1. New standalone test file + extend existing TESTING-GUIDE.md (recommended)

Create `tests/ssr-hydration.test.ts` with a self-contained harness using the existing
`installWindow` pattern from `hydration.test.ts`. Test three suites:
- Transform parity across SSR→hydrate
- `--animation-transform` var composition after re-render
- `onTransformConflict` in real SSR→hydrate→update cycle

Update `docs/TESTING-GUIDE.md` with a new "SSR/Hydration Testing" section documenting the
harness pattern.

- **Pros**: Zero changes to existing tests; additive; self-contained.
- **Cons**: Some setup duplication (`fakeTextEngine`, `installWindow`) vs. `hydration.test.ts`.
- **Effort**: Low

### 2. Extend `tests/hydration.test.ts` with new describe blocks

Add the new suites directly to the existing hydration test file.

- **Pros**: No new file; helper reuse.
- **Cons**: `hydration.test.ts` grows beyond its current scope; harder to navigate; the existing file tests hydration mechanics while the new tests are semantically about transform/animation behavior.
- **Effort**: Low

### 3. Extract shared test helpers into `tests/helpers.ts`

Refactor the `fakeTextEngine` + `installWindow` + `getHydrationRoot` helpers into a shared
module, then reference them from both `hydration.test.ts` and the new `ssr-hydration.test.ts`.

- **Pros**: DRY; scales to future test files.
- **Cons**: Introduces a non-test-runner file into `tests/`; moderate refactor risk.
- **Effort**: Medium

## Recommendation

**Option 1** (new file, no refactor). The change is purely additive. Duplication of the
`fakeTextEngine` helper is minimal (~10 lines) and avoids touching any passing test. A follow-up
refactor (Option 3) can extract helpers once two or more files share them.

The docs update targets `docs/TESTING-GUIDE.md` (the actual file) not `docs/TESTING.md`. This
should be confirmed with the author before writing the spec.

## Risks

- **happy-dom `var()` limitation**: `var(--animation-transform)` is never resolved to a CSS
  value by happy-dom — tests can only assert the literal string includes `var(--animation-transform)`,
  not what value the browser would paint. Tests must be written to assert string contract, not
  computed value. This is explicitly acceptable per the verify-report warning.
- **`createApp` scheduler coupling**: `createApp` uses `effect()` + `scheduleRender`. Tests
  that trigger updates must either call the captured scheduler callback or use the testing
  utilities in `src/testing.js`. The existing `commit.test.ts` pattern (inject scheduler) is
  the proven approach.
- **Docs path mismatch**: Spec/tasks must reference `docs/TESTING-GUIDE.md`, not
  `docs/TESTING.md`, to avoid creating a duplicate/orphan file.

## Ready for Proposal

**Yes** — with one confirmation needed:

> Does `docs/TESTING.md` in the scope refer to the existing `docs/TESTING-GUIDE.md`,
> or should a new `docs/TESTING.md` file be created?
>
> Recommendation: update `docs/TESTING-GUIDE.md` (existing authoritative file). Creating
> `docs/TESTING.md` would duplicate content and fragment the docs.
