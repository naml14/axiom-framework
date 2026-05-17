# Design: Document Breakpoints Container Query

## Technical Approach

Make the existing responsive behavior explicit without changing runtime logic. The canonical user/contributor spec will live at `openspec/specs/responsive-breakpoints.md`, while the existing delta spec remains under `openspec/changes/document-breakpoints-container-query/specs/responsive-breakpoints/spec.md`. Source comments will point maintainers from the two implementation touchpoints (`at` normalization and responsive resolution) to the spec, and `docs/COOKBOOK.md` will add an end-user recipe.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Documentation authority | Create `openspec/specs/responsive-breakpoints.md` as the canonical reference | Put the rule only in Cookbook or code comments | The behavior affects both users and maintainers; OpenSpec is the durable contract. |
| Runtime scope | Documentation/comments only; no resolver or syntax changes | Adjust breakpoint merge logic or viewport fallback behavior | Requirements explicitly forbid code changes, and current implementation already matches the intended public `at` behavior. |
| Public semantics | Describe `at` as a container-query model using parent `maxWidth`/`maxHeight` constraints | Describe it as viewport media-query behavior | `resolveResponsiveLayout()` receives container constraints from reflow/engines, so viewport wording would be misleading. |
| Conflict resolution | Document additive cascade where the largest matching normalized breakpoint wins | Say “last declaration wins” generally | `resolveAt()` sorts named/numeric `at` keys ascending, then `mergeBreakpointOverrides()` assigns in order; for public `at`, the most specific matching breakpoint wins. |
| `vw`/`vh` fallback | State fallback to container size is by design when explicit viewport dimensions are absent | Treat fallback as a temporary limitation | `resolveLayoutDimension()` already uses `viewportWidth ?? maxWidth` and `viewportHeight ?? maxHeight`; documenting this prevents future “fixes” that would break deterministic SSR/testing. |

## Data Flow

```text
User `at` prop
  └─ src/syntax/h.ts: resolveAt() sorts breakpoints by minWidth
      └─ LayoutProps.breakpoints
          └─ src/render/strategy/responsive.ts: mergeBreakpointOverrides()
              ├─ matches against LayoutConstraints.maxWidth/maxHeight
              └─ resolves %, vw, vh dimensions from constraints
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `openspec/specs/responsive-breakpoints.md` | Create | Canonical spec for container-query breakpoints, `vw`/`vh` fallback, and additive most-specific resolution. |
| `src/syntax/h.ts` | Modify comments only | Add a concise spec reference near `at`/`resolveAt()` and note that public `at` keys are normalized before rendering. |
| `src/render/strategy/responsive.ts` | Modify comments only | Add a spec reference near responsive resolution and the `vw`/`vh` fallback behavior. |
| `docs/COOKBOOK.md` | Modify | Add a practical recipe showing `at: { sm, md, lg }` adapting to container width, not viewport width. |

## Interfaces / Contracts

No new TypeScript interfaces or public APIs. The documented contract is:

```ts
at: {
  md: { flex: 'row', gap: 16 },
  lg: { padding: 32 }
}
```

Named keys map through `BREAKPOINT_PX`; numeric keys remain supported through `Number(key)`. Matching uses the parent container constraints supplied by reflow, not DOM reads.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Documentation | Spec contains all required semantics | Review `openspec/specs/responsive-breakpoints.md` against the change spec scenarios. |
| Comments | Source references are comments only | Inspect diffs for `src/syntax/h.ts` and `src/render/strategy/responsive.ts`; no executable statements changed. |
| Regression | Existing behavior remains unchanged | Optional: run `bun test tests/responsive.test.ts tests/syntax/snapshots.test.ts`; no new tests required for documentation-only work. |

## Migration / Rollout

No migration required. This is a documentation and comment-only clarification of existing behavior.

## Open Questions

None.
