# Design system — Axiom demo

Source of truth for the visual language of the Axiom demo (`demo/`).
Read this before touching any demo stylesheet.

## Sources

| Path | Role |
| --- | --- |
| `demo/style.css` | Runtime stylesheet for every demo page (launcher, static dashboard, SSR pages, DOM comparison). Dark "editorial" theme. |
| `scripts/templates/src/styles.css` | The light starter theme shipped by `create-axiom`. A separate, light system — not the demo theme. |

Refreshed on 2026-11-04 (`odd/tasks/demo-visual-refresh.md`): the scale, the contrast of the
muted text and the accent palette were rebuilt. The values below are the ones in the source
today; the previous values are listed under "History" so the change stays traceable.

## Color

All tokens live in `demo/style.css` (`:root`).

### Derivation

The palette is **derived from the logo**, not chosen by eye. The logo pixels
(`Images/axiom-logo.png`, `Images/axiom-logo-no-letras.png`) were decoded and their
dominant colors measured:

| Logo pixel | Share | Hue | Role in the palette |
| --- | --- | --- | --- |
| `#1d2239` | 34.5% | 231 | panel navy → surface ramp |
| `#263456` | 17.9% | 222 | panel light → borders |
| `#306fcc` | 6.4% | 215 | **primary blue** |
| `#36a0de` | 4.5% | 202 | sky blue |
| `#34cadb` | 2.7% | 186 | **cyan** |
| `#708ec8` | 4.1% | 220 | **periwinkle / indigo** |
| `#0f50b5` | 1.9% | 216 | deep blue → glows and rails |
| `#100e24` | — | 245 | near-black indigo → background ramp |

Two semantics the logo does not have were placed by **color theory**: warning at
amber (~40°, the complement of the brand blue) and danger at rose (~350°, opposite the
cyan-green), so neither can be confused with a brand hue on a dark ground. Every
lightness was then raised to the smallest step that clears **5.2:1** on the lightest
surface (`--surface-3`), which keeps AA with margin at the 10–13px sizes the sidebar uses.

### Tokens

| Token | Value | Usage |
| --- | --- | --- |
| `--bg` | `#090b13` | Page background |
| `--bg-sidebar` | `#0f111d` | Sidebar surface |
| `--surface` | `#141827` | Card surface |
| `--surface-2` | `#1c2133` | Raised surface (inputs, chips, cards) |
| `--surface-3` | `#262d43` | Highest surface (tracks, code) |
| `--border` | `#2a395a` | Visible border |
| `--border-subtle` | `#1e253b` | Hairline separator |
| `--text` | `#eef0f7` | Primary text |
| `--text-muted` | `#97a1c4` | Secondary text |
| `--text-dim` | `#95a0bf` | Tertiary text, de-emphasized labels |
| `--accent-blue` | `#5ea3f7` | Primary accent (brand, active state, focus, total metric) |
| `--accent-cyan` | `#26c7d9` | Secondary accent (DOM-free, success, metrics badge) |
| `--accent-indigo` | `#83a0db` | Tertiary accent (grid cells, layout steps) |
| `--accent-amber` | `#f9a806` | Warning accent ("before"/legacy, over-budget) |
| `--accent-rose` | `#fb768c` | Destructive accent (errors, invalid state) |
| `--accent-blue-deep` | `#1053c6` | Structural blue: glows, rails, deep borders |

The starter template ships its own light tokens (`scripts/templates/src/styles.css:2-11`):
`--indigo: #4f46e5`, `--text-muted: #64748b`, `--border: rgba(15,23,42,0.1)`, `--radius: 10px`,
`color-scheme: light`. Those do **not** apply to the demo.

### Contrast

WCAG 2.1 ratios, computed from the token values:

| Token | `--bg` | `--surface` | `--surface-2` | `--surface-3` | AA (4.5:1) |
| --- | --- | --- | --- | --- | --- |
| `--text` | 17.25 | 15.50 | 14.03 | 11.98 | yes |
| `--text-muted` | 7.68 | 6.90 | 6.25 | 5.34 | yes |
| `--text-dim` | 7.54 | 6.77 | 6.13 | 5.24 | yes |
| `--accent-blue` | 7.54 | 6.77 | 6.13 | 5.24 | yes |
| `--accent-cyan` | 9.59 | 8.62 | 7.80 | 6.66 | yes |
| `--accent-indigo` | 7.50 | 6.74 | 6.10 | 5.21 | yes |
| `--accent-amber` | 9.95 | 8.94 | 8.09 | 6.91 | yes |
| `--accent-rose` | 7.55 | 6.78 | 6.14 | 5.25 | yes |

### History

Two earlier palettes, both replaced:

1. `--text-muted: #6868a0` (3.9:1 on `--bg`, below AA at the 11–13px sizes the sidebar
   uses) with `--accent-violet: #7c3aed`, `--accent-teal: #0d9488`, `--accent-amber: #d97706`,
   `--accent-rose: #e11d48`, `--accent-sky: #0284c7` — none of them reached 4.5:1 as text.
2. A violet-centric refresh (`--accent-violet: #a78bfa` and friends) that fixed the contrast
   but contradicted the logo: the logo is blue and cyan, with no violet in it.

The vocabulary changed with the palette: the accents are `--accent-blue`, `--accent-cyan`,
`--accent-indigo`, `--accent-amber`, `--accent-rose`, and the card/tag classes follow
(`.accent-blue`, `.tag-cyan`, …). `demo/data.ts` and `demo/ruta-b-showcase.ts` carry the
same names.

## Typography

- Families: **Inter** (UI) and **JetBrains Mono** (code), loaded from Google Fonts
  via `@import` (`demo/style.css:11`). Fallback stacks are declared in `body`.
- Base: `body { font-size: 14px; line-height: 1.5 }`.

### Scale

| Token | Size | Where |
| --- | --- | --- |
| `--text-display` | 56px | Launcher headline |
| `--text-title` | 26px | Launcher section headline, launcher stat value |
| `--text-lead` | 18px | Launcher lead |
| `--text-lg` | 22px | Brand wordmark, hero title |
| `--text-body` | 14px | Body copy, card title |
| `--text-sm` | 13px | Card body, hero body, secondary copy |
| `--text-label` | 12px | Controls, labels, chips, code |
| `--text-micro` | 11px | Section titles, code, micro copy |
| `--text-tiny` | 10px | Badges, metric labels |

Fifty-five rules in `demo/style.css` map to these tokens. The sizes that stay literal belong to
a single element and would only add a step: the modal title (19px, on a row the engine owns),
the brand icon (24px), the launcher brand name (19px), the launcher server title (20px), the
launcher card title (17px), the total metric (15px) and the launcher headline at the mobile
breakpoint (38px).

### History

The demo used thirteen distinct sizes (9, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 19, 20,
22px) with no hierarchy: the hero title and a metric label were 20px and 10px with nothing in
between. The nine steps above replaced them, and the launcher keeps its own display sizes on
purpose: a landing page reads different from an app shell.

## Spacing

| Token | Value |
| --- | --- |
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 20px |
| `--space-6` | 24px |
| `--space-7` | 32px |

## Radius

| Token | Value | Usage |
| --- | --- | --- |
| `--radius-sm` | 6px | Inputs, small chips |
| `--radius-md` | 10px | Cards, panels |
| `--radius-lg` | 14px | Large cards, launcher cards, modal |
| `--radius-pill` | 999px | Pills and buttons |

## Elevation

| Token | Value |
| --- | --- |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.35)` |
| `--shadow-md` | `0 8px 24px rgba(0,0,0,0.32)` |
| `--shadow-lg` | `0 24px 64px rgba(0,0,0,0.55)` |
| `--shadow-glow` | `0 8px 32px rgba(124,58,237,0.18)` |

## Components

| Component | Selector |
| --- | --- |
| Brand | `.brand`, `.brand h1`, `.tagline` |
| Sidebar section | `.sidebar-section-title` |
| Sidebar index | `.sidebar-index` (`demo/sidebar-navigation.css`) |
| Control row | `.control-row`, `.control-label`, `.control-value` |
| Toggle button | `.btn-toggle` |
| Hero | `.hero-badge`, `.hero-title`, `.hero-body` |
| Card | `.card`, `.card-title`, `.card-body` |
| Tag bubble | `.tag-bubble`, `.tag-blue` … `.tag-indigo` |
| Tag bubble dot | `.tag-bubble::before` (the colour lives in the dot, the label stays neutral) |
| Metric bar | `.metrics-footer`, `.metric-item`, `.metric-label`, `.metric-value` |
| Portal modal | `.portal-modal*` |
| Grid cell | `.grid-cell` |
| Syntax panel | `.syntax-panel-label`, `.syntax-demo-item` |
| Launcher | `.launcher-*` (`demo/index.html`) |

### Accent discipline

One accent per surface. The cards of the masonry canvas share a blue rail
(`.card[class*="accent-"]`), the tag bubbles carry the colour in their label only, and the
palette stays available where it is semantic: grid showcase cells, breakpoint legend, status
colours. Twenty rails in five colours competed with the content instead of framing it.

## Rules for engine-mounted trees

The Axiom engine positions children in memory and the commit writes
`position`/`transform`/`width`/`height` inline. CSS must not fight it. Full derivation
and measurements live in `odd/tasks/demo-ui-polish.md`; the rules that constrain a
visual refresh:

1. `line-height` ≤ 20px for any text inside an engine tree (the engine uses a 20px grid).
   The one exception is `.hero-title`, whose row the engine declares as 26px
   (`HERO_TITLE_HEIGHT` in `demo/components.ts`): its CSS line box has to be exactly 26px.
2. No CSS `padding`/`border` on engine nodes: it shifts absolutely positioned children
   and eats the declared height. The inset is declared by the engine through the node's
   `padding` prop.
3. Explicit `height` on every text row and every DOM control (`input`, `button`).
4. No `attrs.style` inside a tree: it overwrites the committed geometry.
5. In a `row`, declare `width` on every child.
6. No `<br>`: separate rows with `gap`.
7. `attrs` only with static values — the diff never compares them (`src/render/diff.ts`).
8. Inline `style` attributes from SSR need `!important` to beat the engine's inline
   geometry (`demo/ssr-page.tsx`, `demo/streaming-route.ts`).
9. A 1px border inside a 20px engine row costs 2px of line box: the line box of a bordered
   element has to fit `height - 2 × border`.
10. A `::before` inside an engine node eats horizontal space that the engine does not measure:
    the declared width has to reserve it. The tag bubble reserves 14px for its colour dot
    (`getTagWidth` in `demo/layout.ts` goes from +26 to +40px).

`tests/demo-visual-contract.test.ts` pins rules 1, 9 and the token contract;
`tests/demo-sections.test.ts` pins rules 2 and 3 for the syntax hosts.
