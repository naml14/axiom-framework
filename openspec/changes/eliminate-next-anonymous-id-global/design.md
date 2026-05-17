# Design: Eliminate nextAnonymousId Global

## Technical Approach

Replace the mutable `nextAnonymousId` fallback in `src/render/component.ts` with a deterministic FNV-1a hash derived from `fn.toString()`. Keep the existing display-name precedence (`explicit name` → `fn.name` → fallback), add `ComponentOptions` for `defineComponent(fn, { name })`, and preserve the legacy `(name, fn)` overload unchanged. The generated fallback remains human-readable as `Component#{8-hex}` and is metadata only.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|----------|--------|-------------------------|-----------|
| Hash algorithm | 32-bit FNV-1a formatted with `padStart(8, '0')` | Cryptographic hash; counter with reset hook | FNV-1a is deterministic, tiny, dependency-free, and sufficient for debug labels. |
| Name precedence | `options.name`/legacy name, then `fn.name`, then `Component#{hash}` | Always hash anonymous overloads; ignore `fn.name` | Preserves existing behavior for named functions while removing only the global anonymous counter. |
| Options API | Add `ComponentOptions { name?: string }` and overload `defineComponent(fn, options?)` | Rename legacy overload; accept bare second string | Object options scale without ambiguity and do not break `defineComponent('Name', fn)`. |
| Minifier behavior | Document identical `fn.toString()` sources produce identical display names | Try to salt hashes; include file/line data | Salts reintroduce nondeterminism or build-tool coupling. Explicit names are the correct production escape hatch. |

## Data Flow

    defineComponent(input, maybeOptionsOrFn)
      └─→ normalizeComponentDefinition()
            ├─ legacy string name OR options.name
            ├─ sanitizeDisplayName()
            └─ resolveComponentDisplayNameInternal(fn, explicit)
                  ├─ explicit display name
                  ├─ function name
                  └─ Component# + fnv1a(fn.toString())

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/render/component.ts` | Modify | Remove `nextAnonymousId`, add FNV-1a helper, parse `ComponentOptions`, and add the new overload while preserving existing overloads. |
| `src/core/types.ts` | Modify | Add exported `ComponentOptions` near `ComponentDefinition`. |
| `src/index.ts` | Modify | Re-export `ComponentOptions` from the public API. |
| `tests/component.test.ts` | Modify | Assert deterministic anonymous hash format, identical source equality, different source difference, options naming, and legacy naming. |
| `tests/types/component.test-d.ts` | Create | Cover generic prop inference and overload compatibility for `defineComponent(fn, options?)` and `(name, fn)`. |
| `openspec/changes/eliminate-next-anonymous-id-global/specs/component/spec.md` | Modify | Ensure minifier caveats and explicit-name guidance are captured in the component capability delta. |

## Interfaces / Contracts

```ts
export interface ComponentOptions {
  name?: string
}

export function defineComponent<Props = void>(
  fn: (props: Props) => ComponentNode,
  options?: ComponentOptions,
): ComponentDefinition<Props> & ((props: Props) => ComponentNode)

export function defineComponent<Props = void>(
  displayName: string,
  fn: (props: Props) => ComponentNode,
): ComponentDefinition<Props> & ((props: Props) => ComponentNode)
```

Invalid or blank names continue through `sanitizeDisplayName`; blank options names fall back to `fn.name`/hash just like blank legacy names.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Hash fallback | Use anonymous arrow functions; assert `^Component#[0-9a-f]{8}$`, stable repeated definitions, and different bodies differ. |
| Unit | Explicit precedence | Assert `defineComponent(fn, { name })` and `defineComponent('Name', fn)` skip hash fallback. |
| Type | Public overloads | Add `expect-type` coverage for options, legacy overload, and prop inference. |
| Integration | SSR/client consistency | Define equivalent component functions in test context and compare display names used by render paths. |
| E2E | Browser minifier behavior | Not available; document caveat in OpenSpec/docs and recommend explicit names. |

## Migration / Rollout

No migration required. Existing `defineComponent(fn)` and `defineComponent('Name', fn)` calls remain valid. Debug labels for anonymous components change from sequential numbers to deterministic hashes.

## Open Questions

- [ ] None.
