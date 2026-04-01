# Tasks: Axiom MVP Demo (Phase 4)

## Phase 1: Setup & Scaffolding
- [ ] 1.1 Create `demo/index.html` with basic HTML5 boilerplate, CSS link, and JS script tag.
- [ ] 1.2 Create `demo/style.css` with a basic CSS reset.
- [ ] 1.3 Create `demo/app.ts` as the main entry point.
- [ ] 1.4 Update `package.json` to include the build script: `bun build demo/app.ts --outfile demo/app.js --target browser`.

## Phase 2: Styling & Visual Theme (CSS)
- [ ] 2.1 In `demo/style.css`, define the dark editorial theme variables (backgrounds, text colors, and the 5 accent colors).
- [ ] 2.2 In `demo/style.css`, implement the UI shell styles: top control bar, metrics display area, and main masonry container.
- [ ] 2.3 In `demo/style.css`, implement card variants (standard, hero, quote) with appropriate padding, typography, and borders.
- [ ] 2.4 In `demo/style.css`, add rules to hide tags beyond the 8th item (e.g., using `:nth-of-type(n+9) { display: none; }`).

## Phase 3: Core Logic & Layout Engine (JS/TS)
- [ ] 3.1 In `demo/app.ts`, mock a dataset of editorial items with properties: title, excerpt, author, tags array, and variant type.
- [ ] 3.2 In `demo/app.ts`, implement the multi-column masonry layout algorithm (greedy shortest-column distribution) without flexWrap.
- [ ] 3.3 In `demo/app.ts`, integrate the Axiom framework to render the generated masonry structure to the DOM in `demo/index.html`.

## Phase 4: Animation & Metrics
- [ ] 4.1 In `demo/app.ts`, implement the `requestAnimationFrame` (rAF) loop for the continuous animation.
- [ ] 4.2 In `demo/app.ts`, add bouncing logic to animate the `containerWidth` between 360px and 1240px at exactly 6px per frame.
- [ ] 4.3 In `demo/app.ts`, build the FPS counter and metrics tracking logic.
- [ ] 4.4 In `demo/app.ts`, implement direct DOM updates for the metrics display to avoid re-rendering the entire app tree.

## Phase 5: Controls & Interactivity
- [ ] 5.1 In `demo/index.html`, add input elements: a width slider, an items count slider, an animation toggle button, and a metrics toggle button.
- [ ] 5.2 In `demo/app.ts`, wire event listeners to the controls to dynamically update the application state.
- [ ] 5.3 In `demo/app.ts`, ensure that toggling the animation pauses/resumes the rAF loop, and manual width slider adjustments update the layout immediately.
- [ ] 5.4 Audit the implementation to guarantee ZERO changes have been made to the `src/` directory.