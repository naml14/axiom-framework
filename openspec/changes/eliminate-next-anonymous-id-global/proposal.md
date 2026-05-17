# Proposal: Eliminate nextAnonymousId Global

## Intent

Eliminate the mutable global `nextAnonymousId` counter in `src/render/component.ts` to ensure deterministic component naming and remove test flakiness.

## Scope

### In Scope
- Core: Replace `nextAnonymousId++` with FNV-1a hash of `fn.toString()`.
- API: Add `ComponentOptions = { name?: string }` to `src/core/types.ts`.
- API: Add overload `defineComponent(fn, options?)` alongside existing signatures.
- Spec: Create `openspec/specs/component.md` documenting deterministic naming and minifier caveats.
- Tests: Add SSR consistency tests; verify hash behavior for identical/different function bodies.

### Out of Scope
- Modifying the existing `defineComponent(name, fn)` overload signature.
- Modifying how `_id` identity handle is generated (keeps using `Symbol('axiom-component')`).

## Capabilities

### New Capabilities
- `component`: Defines how components are initialized, uniquely identified, and how their display names are deterministically derived from source text or options.

### Modified Capabilities
None

## Approach

Combine an FNV-1a hash of the component function source with a new `ComponentOptions` object API. 
Replace the global mutable counter with an 8-character hex digest of `fn.toString()` for anonymous components. 
Introduce `ComponentOptions` to explicitly set a name, maintaining backward compatibility with the existing explicit name overload.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/render/component.ts` | Modified | Replaces `nextAnonymousId` with FNV-1a hashing logic. Updates overloads. |
| `src/core/types.ts` | Modified | Adds `ComponentOptions` type. |
| `src/index.ts` | Modified | Re-exports `ComponentOptions`. |
| `tests/component.test.ts` | Modified | Adds hash consistency and collision tests. |
| `openspec/specs/component.md` | New | Documents the component naming capability. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Minifier collision | Low | Document that explicit names are recommended for production-critical debug labels. |
| `fn.toString()` variance across engines | Low | Accept hash fallback as best-effort since it is just metadata for debugging, not runtime logic. |

## Rollback Plan

Revert changes to `src/render/component.ts` restoring the `nextAnonymousId` counter. Revert type additions in `src/core/types.ts` and `src/index.ts`. Delete `openspec/specs/component.md`.

## Dependencies

- None

## Success Criteria

- [ ] `nextAnonymousId` is removed from `src/render/component.ts`.
- [ ] Anonymous components receive consistent `Component#{hash}` names.
- [ ] The `defineComponent(fn, { name: '...' })` overload works correctly.
- [ ] `openspec/specs/component.md` is created and details the naming rules.
- [ ] Existing tests pass without reliance on sequential numbering.
