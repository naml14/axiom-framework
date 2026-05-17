# Exploration: optimize-reflow-portals

## Current State

`reflow.ts` has two paths that appear to handle portal children:

### Path A — `layoutNode` portal block (lines 98–108)
```ts
if (nodeType === 'portal') {
  result.width[idx] = 0
  result.height[idx] = 0
  if (!getPortalCssManaged(prepared)) {
    for (const child of children) {
      layoutNode(child, constraints, result, lineHeight)  // ← portal children
    }
  }
  return
}
```

### Path B — `reflowPortalChildren` second pass (line 50)
```ts
reflowPortalChildren(prepared, constraints, result, lineHeight)
```
This recursively walks the tree, finds `cssManaged:false` portals, and calls
`layoutNode(child)` on each of their children.

---

## Critical Discovery: Path A is Dead Code

The engines (`measureSimple`, `measureFlex`, `measureGrid`) ALL skip portal nodes
with an explicit `continue` / early exit — they **never** call `layoutNode(portal)`.

Call chain for a tree with `root → portal(cssManaged:false) → div`:

```
reflow()
  └─ layoutNode(root)          ← root is not a portal
       └─ measureSimple(root)  ← iterates root's children
            └─ portal child?  → continue  ← SKIPPED, layoutNode(portal) never called
```

Path A (`layoutNode` lines 98–108) is **never reached** during a standard `reflow()`.
The measurement engines use their own private recursion (`layoutChild`, local loops)
and never re-enter `layoutNode`.

All actual portal-child layout happens exclusively in the **second pass** via `reflowPortalChildren`.

---

## Implication: The Intent's Premise is Incorrect

The change intent states:
> "Portals with `cssManaged=false` currently layout their children **twice**: during
> `layoutNode` iteration (lines 100–107) AND during `reflowPortalChildren()` (line 49)."

**This is not what the code does.** There is no double layout. `layoutNode`'s portal
block is dead code. Only `reflowPortalChildren` lays out portal children.

Removing `reflowPortalChildren()` without additional changes would **break portal layout
entirely** — portal children would never receive computed dimensions.

---

## Affected Areas

- `src/render/reflow.ts` — contains both paths; Path A is dead, Path B is live
- `tests/portal.test.ts` — `describe('reflow — cssManaged:false portal children …')` at line 952 would fail if `reflowPortalChildren` were removed
- `openspec/specs/render-pipeline.md` — does not exist yet; scope asks it be created

---

## Approaches

### Option 1 — Remove dead code in `layoutNode`, keep `reflowPortalChildren` ✅ RECOMMENDED
Remove the dead portal-handling block from `layoutNode` (lines 98–108). Keep
`reflowPortalChildren` as the single authoritative path. The `layoutNode` portal block
adds zero behavior today but creates confusion for future maintainers.

- **Pros**: Removes confusion, no behavior change, safe refactor
- **Cons**: Doesn't achieve the stated intent of removing the second pass
- **Effort**: Low
- **Risk**: None — dead code removal, all existing tests pass unchanged

### Option 2 — Unify into a single pass: make engines call `layoutNode` on portal subtrees
Modify `measureSimple`/`measureFlex`/`measureGrid` to call `layoutNode(child)` when
the child is a `cssManaged:false` portal (instead of skipping). Then remove the
`reflowPortalChildren` second pass and the dead code in `layoutNode`.

- **Pros**: True single-pass layout, eliminates the second traversal
- **Cons**: Non-trivial refactor touching three engines; engines currently have no
  access to `constraints` (only `availableWidth/Height`) — `layoutNode` needs full
  `LayoutConstraints`; risks regressions in flex/grid portal positioning
- **Effort**: Medium–High
- **Risk**: Medium — changes engine internals; requires careful regression testing

### Option 3 — Keep both paths exactly as-is, no change
Do nothing. Both paths exist, Path A is dead, no user-visible issue today.

- **Pros**: Zero risk
- **Cons**: Doesn't address the stated goal; dead code persists
- **Effort**: None

---

## Recommendation

**Stop and clarify with the user before proceeding.**

The current intent asks to remove `reflowPortalChildren` (the live path) and keep
`layoutNode`'s portal block (the dead path) — this would be a breaking change.

The correct options are:
- **If the goal is "reduce confusion / clean dead code"** → Option 1: remove the dead block in `layoutNode`.
- **If the goal is "true single-pass layout"** → Option 2: migrate portal handling into the engines and remove the second pass (larger scope than originally specified).

Neither option matches the intent as written. User confirmation required.

---

## Risks

- Removing `reflowPortalChildren` without engine changes → portal children get
  `width=0, height=0` at runtime; tests in `portal.test.ts:952+` would fail.
- Proceeding without clarification risks implementing the wrong fix.

---

## Ready for Proposal

**No — blocked pending user clarification.** The premise of the change intent does not
match the actual code behavior. Two questions need answers before proposal:

1. Is the goal (a) remove dead code from `layoutNode`, or (b) consolidate into a true single pass?
2. Are engine-level changes (touching `measureSimple`/`measureFlex`/`measureGrid`) in scope?
