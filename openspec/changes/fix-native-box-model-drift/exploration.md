# Exploration: fix-native-box-model-drift

## Current State

Axiom uses a pure JS absolute layout engine. Every framework-managed element gets
`position: absolute`, `transform: translate(x,y)`, explicit `width` and `height`
via inline styles. The `applyFrameworkLayout` function in `src/render/commit.ts`
was recently updated to also reset `margin`, `padding`, and `box-sizing` after
`<button>` default UA styles broke the engine.

Current reset in `applyFrameworkLayout` (commit.ts, lines 421-424):
```ts
el.style.position    = 'absolute'
el.style.boxSizing   = 'border-box'
el.style.margin      = '0'
el.style.padding     = '0'
```

This covers the **client-side full-commit and incremental-update paths** only.
It does NOT cover:
1. The SSR inline style string.
2. The hydration path (`commitHydrate`).
3. Elements with native `border` (form controls, fieldset).
4. CSS-managed portals (intentional opt-out).

---

## Affected Areas

| File | Concern |
|------|---------|
| `src/render/commit.ts` | `applyFrameworkLayout` — already fixed for CSR; NOT called in hydration path |
| `src/ssr.ts` | Inline style string (line 141) missing `box-sizing`, `margin`, `padding` |
| `src/render/commit.ts` `commitHydrate` | Never calls `applyFrameworkLayout`; hydrated DOM keeps UA styles until first `applyOps` update |
| `src/app.ts` | No global CSS injection; no `<style>` tag insertion at mount |
| `src/features/style.ts` | `SAFE_STYLE_KEYS` whitelist exposes `padding` and `border*` — user can override padding or border but the framework reset runs first so order matters |
| `src/features/portal.ts` | CSS-managed portals intentionally skip the reset — correct by design |

---

## Gap Analysis

### Gap 1 — SSR style string missing the reset (CRITICAL)

`ssr.ts` line 141 builds:
```
position:absolute;left:0px;top:0px;transform:translate(Xpx,Ypx);width:Wpx;height:Hpx;
```

Missing: `box-sizing:border-box;margin:0;padding:0;`

**Impact:** SSR-rendered HTML carries UA default styles (margin, padding, border-box
gap). The page looks correct only after the client JS hydrates and runs `applyOps`,
causing a visible layout shift (CLS) on first paint for any element with UA defaults
(`<button>`, `<input>`, `<fieldset>`, `<ul>`, `<h1>`-`<h6>`, `<p>`, etc.).

### Gap 2 — Hydration path never applies the layout reset (CRITICAL)

`commitHydrate` matches existing DOM elements by `data-axiom-id`, attaches
listeners, validates content — but never calls `applyFrameworkLayout`. So after
hydration, if the SSR string is fixed (Gap 1), re-hydrated elements will have the
correct inline styles from the server. But if SSR is NOT fixed, the hydrated page
will carry UA styles until the next reactive update triggers `applyOps`.

The two gaps compound: fix SSR AND call `applyFrameworkLayout` inside
`commitHydrate` after matching each element, or one will mask the other only
partially.

### Gap 3 — Native `border` on form elements (MODERATE)

Elements like `<input>`, `<textarea>`, `<select>`, `<fieldset>` have UA-default
`border`. With `box-sizing: border-box` the border is now subtracted from content
area rather than added to the bounding box — so layout size is correct, but the
visual border remains and may be unintentional.

Resetting `border: 0` in `applyFrameworkLayout` would be aggressive (breaks
intentional use of `style={{ border: '1px solid red' }}`). A safer alternative is
to document it and let users opt in via the style prop API.

### Gap 4 — Other UA properties that don't affect bounding box (LOW / INFORMATIONAL)

These properties DO NOT affect the absolute layout box size, so they don't break
the engine. They may cause visual drift but are recoverable via the `style` prop:
- `line-height` — visual only; height is set explicitly
- `text-align` — visual only
- `font-size`, `font-weight` — affects text measurement (used by text layout engine)
  but this is expected per-element and the engine accounts for it via `font` option
- `color`, `text-decoration` — purely visual
- `list-style` on `<ul>/<ol>` — visual
- SVG default `display: inline` — could cause baseline gap; but SVGs inside Axiom
  get explicit width/height so it's usually absorbed

### Gap 5 — CSS-managed portals (OUT OF SCOPE — by design)

Portal children with `cssManaged: true` (the default) intentionally skip
`applyFrameworkLayout`. They are user-CSS controlled. No action needed.

---

## Approaches

### Approach A — Fix SSR style string + call `applyFrameworkLayout` in `commitHydrate`

**What:**
1. Add `box-sizing:border-box;margin:0;padding:0;` to the style string in `ssr.ts` line 141.
2. Call `applyFrameworkLayout(domEl, layoutData, true)` inside `hydrateNode` after the
   element is matched and before children are processed.

**Pros:**
- Minimal, surgical change
- Follows existing inline-style-only pattern
- No global CSS injection, no side effects
- SSR output and client output converge on first paint

**Cons:**
- Hydration `applyFrameworkLayout` needs the layout data per-element (already
  available in `byMarker` / `layout` arrays so this is straightforward)
- Does not address native `border` on form elements

**Effort:** Low

---

### Approach B — Inject a global `[data-axiom-id]` CSS rule at framework mount

**What:** In `app.ts` `mount()`, inject a `<style>` tag:
```css
[data-axiom-id] {
  box-sizing: border-box !important;
  margin: 0 !important;
  padding: 0 !important;
}
```
In `ssr.ts` `renderHead`, emit the same rule as inline styles (already supported
via `metadata.inlineStyles`).

**Pros:**
- Single source of truth, zero per-element overhead
- Applies before JS runs (SSR + hydration gap closed)
- Can extend to reset `border`, `outline`, `font-size`, etc. with low risk
- Prevents FOUC on any element type, including future ones

**Cons:**
- Requires DOM side-effect in the framework core (`<style>` injection)
- `!important` escalation could conflict with user stylesheets
- SSR requires the head to include the reset rule — needs to be opt-in or automatic
- Could conflict with CSS-managed portal children if selector is too broad
  (mitigated by scoping to `[data-axiom-id]` which portals also carry)

**Effort:** Medium

---

### Approach C — Hybrid: global CSS reset for structural props + inline for layout

**What:** Combine B's `[data-axiom-id]` reset for structural defaults (`margin`,
`padding`, `box-sizing`, `border`) with A's inline-style approach for layout-critical
values (`position`, `transform`, `width`, `height`). This is the most robust but
requires the most coordination.

**Effort:** Medium-High

---

## Recommendation

**Fix both gaps with Approach A first (tactical, correct, zero risk):**
1. Update `ssr.ts` line 141 to include `box-sizing:border-box;margin:0;padding:0;`.
2. In `commitHydrate`'s `hydrateNode`, after matching a DOM element to a prepared
   node, call `applyFrameworkLayout` to sync the reset.

**Then evaluate Approach B as a follow-up hardening pass** to cover element types
like `<input>`, `<fieldset>`, `<table>` without growing the per-element inline style
string. The `[data-axiom-id]` selector is precise enough to avoid collisions with
CSS-managed portals only if portals are also marked with `data-axiom-id` (they are,
see `ssr.ts` line 123 and `commit.ts` portal handling — but portal children are NOT
marked, so the reset would not bleed into portal content unless the portal wrapper
itself receives it, which is acceptable).

---

## Risks

- **SSR/CSR inline style order:** after fixing Gap 1, the SSR-emitted style will
  include `margin:0;padding:0;`. If a user passes `style={{ padding: '8px' }}` on a
  button, `applyManagedStyleToElement` runs AFTER `applyFrameworkLayout`, so the
  user value wins — this is the correct precedence and it works today.
- **Hydration re-applying layout:** calling `applyFrameworkLayout` in `commitHydrate`
  may cause a style mutation on elements that already have the correct inline styles
  from SSR (if Gap 1 is also fixed). This is idempotent — writing the same value
  is a no-op from a rendering perspective.
- **No global CSS mechanism today:** Approach B requires adding new infrastructure
  (style injection at mount). This is a non-trivial change to app.ts and ssr.ts
  contracts. Better to scope it to a separate change.

---

## Ready for Proposal

**Yes.** Two discrete, low-risk changes:
1. (Immediate) Fix SSR style string and hydration reset in `src/ssr.ts` + `src/render/commit.ts`.
2. (Follow-up) Evaluate global CSS reset injection via `[data-axiom-id]` selector for
   broader element coverage and SSR-safe FOUC prevention.
