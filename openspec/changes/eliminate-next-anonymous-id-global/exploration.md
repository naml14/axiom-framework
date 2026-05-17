## Exploration: eliminate-next-anonymous-id-global

### Current State

`src/render/component.ts` declares a module-level mutable counter:

```ts
let nextAnonymousId = 1
// ...
return `Component#${nextAnonymousId++}`
```

This counter is used **only** inside `resolveComponentDisplayNameInternal` when both the
explicit `displayName` and the function's `.name` are blank (e.g. arrow functions or
`() => ...` literals passed without a string prefix).

Key observations:
- `ComponentDefinition<Props>` in `src/core/types.ts` exposes `displayName?: string` but
  there is no `ComponentOptions` type — callers use the two-arity overload
  `defineComponent(name, fn)` for explicit names.
- `_id` is already a `Symbol()` (unique, deterministic within a call-site) — it is **not**
  used for display.
- The mutable global means test-order affects the label: `Anonymous1` in isolation vs
  `Anonymous7` in a full suite.  The test at line 92-95 of `tests/component.test.ts` wisely
  asserts only `length > 0`, but SSR snapshot tests that stringify the component tree will
  be affected.
- No existing `openspec/specs/component.md` file exists; the spec needs to be created as
  part of this change.

### Affected Areas

- `src/render/component.ts` — home of the counter; all changes are here
- `src/core/types.ts` — `ComponentDefinition` may need `ComponentOptions` interface added
- `src/index.ts` — public API exports; `ComponentOptions` should be re-exported when added
- `tests/component.test.ts` — tests that might implicitly rely on numeric suffix ordering
- `openspec/specs/component.md` — needs to be created (doesn't exist)

### Approaches

1. **FNV-1a hash of `fn.toString()`**
   - Replace the counter with a short hex digest of the function source text.
   - Pros: fully deterministic; same function body → same name across SSR and client; human-readable (`Component#a3f2c1b4`); zero external deps (implement ~10-line FNV-1a inline).
   - Cons: two arrow functions with identical bodies get the same name (rare but possible with trivial functions); function source varies between minified and dev builds (must be tested in both).
   - Effort: Low

2. **Hash of `fn.toString()` + call-site symbol description**
   - Like (1) but also incorporates the `_id` Symbol description or a WeakMap counter keyed on `fn` reference.
   - Pros: disambiguates identical bodies; still deterministic per `fn` identity.
   - Cons: slightly more complex; WeakMap key is the function object — different arrow literals at the same source position are different objects anyway, so the WeakMap key IS the disambiguator.
   - Effort: Low-Medium

3. **`ComponentOptions` object API**
   - Add `defineComponent(fn, options?: ComponentOptions)` overload where `ComponentOptions = { name?: string }`.
   - Pair with approach (1) or (2) for the fallback name.
   - Pros: ergonomic; forward-compatible slot to add future options (memo, error boundary, etc.); no breaking change (new optional overload).
   - Cons: slightly larger API surface; the current two-arity `(name, fn)` overload already covers the explicit-name case.
   - Effort: Low (the option bag is a 4-line type addition)

### Recommendation

**Combine Approach 1 + Approach 3.**

- Use **FNV-1a hash** of `fn.toString()` (first 8 hex chars) as the deterministic fallback:
  `Component#a3f2c1b4`. This is stable across SSR/client when not minified, and the spec
  can document that names are "best-effort stable" in minified builds.
- Add `ComponentOptions = { name?: string }` to `src/core/types.ts` and a new overload
  `defineComponent(fn, options?)`. The existing `(name, fn)` overload is kept unchanged
  (no breaking change).
- Keep `_id = Symbol('axiom-component')` as-is; it remains the opaque identity handle.
- Delete `let nextAnonymousId = 1` and its sole reference.

**Minified-build caveat**: in production bundles `fn.toString()` returns compressed source,
so two different components could produce the same 8-char prefix. The spec should document
that `name` option is recommended for production-critical debug labels. Alternatively
the fallback can append `_id` symbol description if the hash is short — but the 8-char
hex from a full function body has very low collision probability.

### Risks

- **Minifier collision**: Two distinct anonymous arrow functions that minify to the same
  string would share a display name. Probability is very low for any realistic component
  tree but is possible. Mitigation: document, add a unit test for identical-body functions
  in dev mode.
- **SSR hydration mismatch**: The display name is metadata only (not serialized to HTML),
  so no hydration risk.
- **Test suite order**: Existing test at line 92 only checks `length > 0` — safe. No test
  asserts a specific numeric suffix, so removal is non-breaking for tests.
- **`fn.toString()` variance**: Arrow function `.toString()` captures the source text
  verbatim in Bun/Node. This is reliable in dev; minified builds may differ. Document
  as "best-effort in minified builds".

### Ready for Proposal

Yes. The change is well-scoped, low-risk, and the recommended approach is clear. The
orchestrator should proceed to `sdd-propose`.
