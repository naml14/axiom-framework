# Proposal: Document Breakpoints Container Query

## Intent

Document Axiom's breakpoint system as a container-query model (resolving against parent container's `maxWidth`, not viewport). We also need to document the fallback behavior for `vw`/`vh` when explicit viewport dimensions are not provided, clarifying these semantics as "by design."

## Scope

### In Scope
- Create `openspec/specs/responsive-breakpoints.md` to define:
  - Container-query model semantics.
  - `vw`/`vh` fallback behavior (documented as "by design").
  - Multiple breakpoints resolution rules (additive cascade).
- Add spec reference comments in `src/syntax/h.ts`.
- Add spec reference comments in `src/render/strategy/responsive.ts`.
- Add a usage example for responsive breakpoints in `docs/COOKBOOK.md`.

### Out of Scope
- Code logic changes.
- Breaking changes.
- Writing a standalone `docs/RESPONSIVE.md` separate from the cookbook.

## Capabilities

### New Capabilities
- `responsive-breakpoints`: Axiom's responsive breakpoint system, acting as a container-query model, additive cascades, and `vw`/`vh` fallbacks.

### Modified Capabilities
- None

## Approach

Use Approach 1 from the exploration. This is a documentation-only change to formally align the spec and comments with the existing codebase behavior.
- We will author the canonical spec at `openspec/specs/responsive-breakpoints.md` detailing the container-width constraint and `vw`/`vh` behavior.
- In `src/syntax/h.ts` and `src/render/strategy/responsive.ts`, we'll add concise inline docstrings or comments pointing developers to the new spec file.
- Finally, `docs/COOKBOOK.md` will receive a new recipe showcasing the `at` prop.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `openspec/specs/responsive-breakpoints.md` | New | Canonical specification |
| `src/syntax/h.ts` | Modified | Add reference comments to spec |
| `src/render/strategy/responsive.ts` | Modified | Add reference comments to spec |
| `docs/COOKBOOK.md` | Modified | Add usage example |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Spec drift if layout constraints change in the future | Low | Spec references in code (h.ts, responsive.ts) will point maintainers to the documentation during future changes. |

## Rollback Plan

Revert the specific documentation commits (spec creation and inline comment additions).

## Dependencies

- None

## Success Criteria

- [ ] `responsive-breakpoints.md` spec exists and fully documents the container-query model.
- [ ] Codebase comments explicitly reference the new spec.
- [ ] Cookbook includes a practical example using `at: { ... }`.
