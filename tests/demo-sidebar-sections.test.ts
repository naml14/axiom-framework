import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const contextDemoPath = join(repoRoot, "demo", "context-demo.ts");
const formsDemoPath = join(repoRoot, "demo", "forms-demo.ts");
const styleCssPath = join(repoRoot, "demo", "style.css");

describe("Sidebar demo trees: no attrs.style and no <br> in engine-owned trees", () => {
	test("demo/context-demo.ts does not pass `style:` inside an `attrs: { ... }` block", async () => {
		const source = await readFile(contextDemoPath, "utf8");

		// Passing `attrs: { style: '...' }` replaces the element's entire
		// `style` attribute and therefore ERASES the engine geometry that
		// commit.ts writes inline. Inside an engine tree this turns boxes
		// into 0-sized or overflowing elements (the original context-form
		// regression). The test forbids the combination.
		const attrsBlock = /attrs:\s*\{[^}]*\}/g;
		const matches = source.match(attrsBlock) ?? [];
		expect(matches.length).toBe(0);
	});

	test("demo/context-demo.ts does not render <br> elements", async () => {
		const source = await readFile(contextDemoPath, "utf8");

		// <br> inside an Axiom tree is positioned as a ~14px block that
		// throws off the line arithmetic and the engine offsets. Sections
		// inside the sidebar must use `gap` to separate rows instead.
		expect(source).not.toContain("h('br'");
	});

	test("demo/context-demo.ts wraps the subtree with provideStore (not a no-op)", async () => {
		const source = await readFile(contextDemoPath, "utf8");

		// The previous version called `provideStore(counterStore, () => …)`
		// AFTER `props.children()` had already been evaluated. Because
		// `provideStore` only pushes during its own callback, the consumers
		// ended up rendered outside the store frame and `injectStore`
		// resolved through the default fallback. The section exists to
		// demonstrate `provideStore` + `injectStore`, so the provider must
		// actually wrap the subtree. Anchor on the Provider block (the
		// file is small) and assert `provideStore` appears BEFORE
		// `props.children()` inside it. Style follows the ordering
		// assertions in tests/portal-demo.test.ts.
		const providerStart = source.indexOf("const Provider = defineComponent");
		expect(providerStart).toBeGreaterThan(-1);
		const provideIdx = source.indexOf("provideStore(counterStore", providerStart);
		const childrenIdx = source.indexOf("props.children()", providerStart);
		expect(provideIdx).toBeGreaterThan(-1);
		expect(childrenIdx).toBeGreaterThan(-1);
		expect(provideIdx).toBeLessThan(childrenIdx);
	});

	test("demo/forms-demo.ts does not pass `style:` or `title:` inside an `attrs: { ... }` block", async () => {
		const source = await readFile(formsDemoPath, "utf8");

		// `attrs.style` would erase the engine geometry written by commit.ts.
		// `attrs.title` is also forbidden: src/render/diff.ts only diffs
		// layout / text / on / style / classes — `attrs` is written once
		// at insert time and never re-applied, so a reactive `title` would
		// freeze at the first-render message while the visible status text
		// updated underneath it. The status row stays a single line that
		// shows only the first error; the full message is intentionally
		// dropped from the DOM.
		const attrsBlock = /attrs:\s*\{([^{}]*)\}/g;
		const matches = [...source.matchAll(attrsBlock)].map((m) => m[1]);
		for (const body of matches) {
			expect(body).not.toMatch(/\bstyle\s*:/);
			expect(body).not.toMatch(/\btitle\s*:/);
		}
	});

	test("demo/forms-demo.ts does not render <br> elements", async () => {
		const source = await readFile(formsDemoPath, "utf8");

		// Same constraint as the context demo: no `<br>` inside the tree;
		// rows are separated by `gap` on the parent stack.
		expect(source).not.toContain("h('br'");
	});

	test("demo/forms-demo.ts keeps the post-mount bind() wiring and __FORMS_DEMO_CLEANUP__ hook", async () => {
		const source = await readFile(formsDemoPath, "utf8");

		// The redesign must not regress the documented bind() escape hatch:
		// inputs are DOM-managed externally after mount and the cleanup
		// hook is exposed on window for hot-reload safety.
		expect(source).toContain("bind(username, usernameInput)");
		expect(source).toContain("bind(email, emailInput)");
		expect(source).toContain("__FORMS_DEMO_CLEANUP__");
	});

	test("demo/forms-demo.ts binds each field label to its input via a real <label htmlFor>", async () => {
		const source = await readFile(formsDemoPath, "utf8");

		// The redesign replaced the previous `<label>` wrapper with a
		// `<div class="hero-badge">`, which broke the click-to-focus
		// behavior and left the input without an accessible name. The fix
		// restores a real <label> with `htmlFor` pointing at `inputId`.
		// `htmlFor` is a first-class prop mapping to the `for` attribute. It
		// is safe even though diff.ts never re-applies `attrs`, because the
		// label→input association is static (it never changes at runtime).
		expect(source).toContain("htmlFor: spec.inputId");
		expect(source).toMatch(/h\('label',\s*\{[^}]*htmlFor:\s*spec\.inputId/);
		// Inputs still carry the matching `id` so the for= wiring actually
		// resolves. Belt-and-braces: the bug was about losing the label
		// element entirely, so we assert the label tag is present.
		expect(source).toMatch(/h\('input',\s*\{[^}]*id:\s*spec\.inputId/);
	});

	test("demo/forms-demo.ts statusLabel returns only one error on the visible line", async () => {
		const source = await readFile(formsDemoPath, "utf8");

		// The redesign must show ONLY the first error on the rendered line
		// (otherwise the status overflows its 20px box and collides with
		// the next sibling). The full message is no longer exposed via
		// `title`: src/render/diff.ts does not re-apply `attrs` after the
		// initial insert, so a reactive tooltip would stay frozen at the
		// first-render message while the visible text updated.
		expect(source).toMatch(/r\.errors\[0\]/);
		expect(source).not.toMatch(/title:\s*r\.errors\.join/);
	});
});

describe("Scoped CSS for the sidebar demo sections", () => {
	test("demo/style.css defines the .demo-card visual chrome without padding", async () => {
		const source = await readFile(styleCssPath, "utf8");

		// `.demo-card` declares background + border + radius only. Inset is
		// owned by the engine node's `padding` prop (a CSS padding here
		// would double-inset the absolutely positioned children). Scope the
		// check to the .demo-card rule body only — not the entire file —
		// so other rules (e.g. .demo-input { padding: 5px 8px }) do not
		// produce a false positive. The selector spans two lines because of
		// the comma-separated list, so we anchor on the opening brace that
		// closes the selector and read forward to the first `}`.
		const selectorStart = source.indexOf(".context-section .demo-card");
		expect(selectorStart).toBeGreaterThan(-1);
		const braceStart = source.indexOf("{", selectorStart);
		expect(braceStart).toBeGreaterThan(-1);
		const braceEnd = source.indexOf("}", braceStart);
		expect(braceEnd).toBeGreaterThan(braceStart);
		const body = source.slice(braceStart + 1, braceEnd);
		expect(body).toContain("border-radius: var(--radius-md);");
		expect(body).not.toMatch(/\bpadding\s*:/);
	});

	test("demo/style.css defines .demo-input with no layout-affecting focus rule", async () => {
		const source = await readFile(styleCssPath, "utf8");

		// The :focus rule may only touch `border-color` / `outline` —
		// anything that changes box geometry would defeat the engine's
		// declared height and overflow the card.
		expect(source).toContain(".demo-input");
		expect(source).toMatch(/\.demo-input:focus\s*\{[^}]*border-color:[^}]*\}/);
		expect(source).not.toMatch(/\.demo-input:focus\s*\{[^}]*(margin|padding|height|width):/);
	});

	test("demo/style.css defines .form-status--invalid with the rose accent color", async () => {
		const source = await readFile(styleCssPath, "utf8");

		// The status modifier carries the validation state visually — it
		// must exist as a scoped rule, otherwise the invalid status would
		// inherit the muted text color and the error would be invisible.
		expect(source).toMatch(/\.form-status--invalid\s*\{[^}]*color:\s*var\(--accent-rose\)/);
	});
});
