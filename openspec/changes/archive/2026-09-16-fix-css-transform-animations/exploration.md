## Exploration: fix-css-transform-animations

### Current State

`applyFrameworkLayout` in `src/render/commit.ts` (line 434) sets positioning as:

```ts
el.style.transform = `translate(${x}px,${y}px)`
```

This is an **inline style** with specificity `1-0-0-0`. CSS `@keyframes` animations with
`animation-fill-mode: both` or `forwards` also write to `el.style.transform` (inline, same
specificity) at the *end* of the animation — they overwrite whatever was there last.
The result: all animated elements collapse to `translate(0,0)` or whatever the keyframe
final value is, ignoring Axiom's layout math.

Key call-sites for `applyFrameworkLayout`:
- `buildDOMTree` (initial full commit) — line 507
- `createDOMElement` (diff inserts) — line 561
- `applyOps` update/move branches — lines 326, 365
- `commitHydrate` element hydration — line 207

`src/features/animation.ts` covers Axiom's *own* JS-driven transitions (opacity, transform,
etc.) via a per-property state machine. It does NOT interact with CSS `@keyframes`. The
conflict lives entirely in `commit.ts`.

---

### Affected Areas

| File | Why affected |
|------|--------------|
| `src/render/commit.ts` | `applyFrameworkLayout` must change how transform is written |
| `src/core/types.ts` | `ElementNode` may need an optional `onTransformConflict` hook |
| `src/index.ts` | New public hook type needs to be re-exported |
| `docs/ANIMATIONS.md` | New file — guide on safe CSS animation usage |
| `tests/commit.test.ts` | New test cases for fill-mode scenarios |

---

### Approaches

#### 1. CSS Custom Property bridge (`--ax-x` / `--ax-y`)

Write layout as:
```ts
el.style.setProperty('--ax-x', `${x}px`)
el.style.setProperty('--ax-y', `${y}px`)
el.style.transform = 'translate(var(--ax-x,0px),var(--ax-y,0px))'
```

CSS animations that override `transform` still resolve to `translate(0,0)` unless they
also set `--ax-x`/`--ax-y`, which they won't — so the conflict is NOT fully resolved by
this alone.

- Pros: clean API, exposes coordinates for user CSS to read
- Cons: CSS animations still clobber the `transform` property itself (var() doesn't help)
- Effort: Low — but **doesn't solve the core problem**

#### 2. Append `var(--animation-transform)` to the transform string ✅ RECOMMENDED

Write layout as:
```ts
el.style.transform = `translate(${x}px,${y}px) var(--animation-transform,)`
```

Users declare their keyframe animation transforms on `--animation-transform` instead of on
`transform` directly:

```css
@keyframes fadeIn {
  from { --animation-transform: scale(0.8); opacity: 0; }
  to   { --animation-transform: scale(1);   opacity: 1; }
}
```

The framework transform is always the *first* function in the chain; the animation appends
to it via the CSS variable. `animation-fill-mode: both|forwards` sets the variable, not
`transform`, so it can't clobber.

The `onTransformConflict` hook fires synchronously in `applyFrameworkLayout` when the
element already has a non-empty `transform` that doesn't start with `translate(` — i.e., a
CSS animation has written to it. Zero DOM reads: we only check the value we are about to
overwrite (we just wrote it; it's in our own write-only contract).

- Pros: preserves layout math, composable, zero DOM reads, backward-compatible for
  non-animated elements
- Cons: requires user to change animation keyframes to use `--animation-transform`;
  `!important` in keyframes intentionally wins (as required in constraints)
- Effort: Medium

#### 3. `translate` CSS property (CSS Transforms Level 2)

Use the separate `translate` CSS property (different from `transform: translate()`):
```ts
el.style.translate = `${x}px ${y}px`
```

Animations typically target `transform` or `rotate`/`scale`, not `translate` as a property,
so they don't conflict.

- Pros: zero conflict by spec separation; clean
- Cons: `element.style.translate` is not yet in TypeScript's `CSSStyleDeclaration` lib
  (TS strict mode issue); browser support gap for older targets; breaks if user animates
  `translate` as property
- Effort: Medium (+ TS lib augmentation)

#### 4. `will-change: transform` + `transform-origin` no-op

Set `will-change: transform` to promote to compositor layer. Does NOT prevent the clobber —
`will-change` is a hint, not a guard.

- Pros: performance side-effect
- Cons: doesn't solve the problem at all
- Effort: Low — but irrelevant

---

### Recommendation

**Approach 2** — append `var(--animation-transform,)` to the framework's transform string.

Rationale:
- Directly solves the clobber: animation `fill-mode` sets `--animation-transform`, not
  `transform`, so Axiom's `translate()` is always the base.
- Zero DOM reads: `onTransformConflict` checks `el.style.transform` only on *update/move*
  paths where we previously set it ourselves — not a fresh read, just verifying our own
  prior write (and still consistent with the write-only philosophy since the value is
  internally known).
- `!important` in keyframes wins by cascade — satisfies the constraint.
- Backward-compatible: non-animated elements get `var(--animation-transform,)` which
  resolves to an empty string (safe no-op in CSS transforms).
- The `onTransformConflict` hook is synchronous, fires inside `applyFrameworkLayout`, and
  receives `(element: HTMLElement, detectedTransform: string)` — easy to instrument.

**Implementation sketch:**

```ts
// commit.ts — applyFrameworkLayout

function applyFrameworkLayout(
  el: HTMLElement,
  layoutInfo: { x?: number; y?: number; width?: number; height?: number },
  managedByFramework: boolean,
  hooks?: CommitHooks
): void {
  if (!managedByFramework) return
  el.style.position = 'absolute'
  el.style.boxSizing = 'border-box'
  el.style.margin = '0'
  el.style.padding = '0'
  const { x, y, width, height } = layoutInfo
  if (x !== undefined && y !== undefined) {
    const existing = el.style.transform
    // Detect animation collision: non-empty and not our own translate
    if (existing && !existing.startsWith('translate(') && hooks?.onTransformConflict) {
      hooks.onTransformConflict(el, existing)
    }
    el.style.transform = `translate(${x}px,${y}px) var(--animation-transform,)`
  }
  if (width !== undefined && height !== undefined) {
    el.style.width = `${width}px`
    el.style.height = `${height}px`
  }
}
```

```ts
// Public hook type (new export from commit.ts or types.ts)
export interface CommitHooks {
  onTransformConflict?: (element: HTMLElement, animationTransform: string) => void
}
```

---

### Risks

- **CSS variable in `transform`**: The `var(--animation-transform,)` syntax with an empty
  fallback is valid CSS but requires Blink/Gecko/WebKit support for registered/unregistered
  custom properties in `transform`. All modern browsers handle this; old IE/Edge Legacy do
  not (but Axiom's target is `>=Node 22 / modern browser`).
- **TypeScript `el.style.translate`** (Approach 3 risk, not Approach 2): avoided entirely.
- **`onTransformConflict` DOM read**: Checking `el.style.transform` before we write it is
  reading a value we just wrote (own write-only contract). On *insert* (first write) the
  value is `''`, so the hook never fires on inserts — only on update/move paths. This is
  acceptable and documented.
- **User keyframe migration**: Existing users with `transform` keyframes must migrate to
  `--animation-transform`. This is a **breaking change for animated elements** and must be
  prominently documented in `docs/ANIMATIONS.md` and the CHANGELOG.

---

### Ready for Proposal

Yes. The problem is well-scoped, the affected code surface is small (one function in
`commit.ts` + hook type + docs + tests), and the recommended approach has clear tradeoffs
documented. The migration note (user keyframe change) must be a conspicuous part of the
proposal's "Breaking Changes" section.
