import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Source-level guards for the T11 (WU4.1) demo layout fixes — D1/D2/D3 of
// odd/tasks/backlog-pendientes.md (P3), measured in a real browser against
// release 0.9.14 (odd/evidence/release-0.9.14/diagnostic.json). These pin the
// fixes without a browser; the numeric evidence lives in the probe runs.

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const styleCssPath = join(repoRoot, "demo", "style.css");
const rutaBShowcasePath = join(repoRoot, "demo", "ruta-b-showcase.ts");
const routerDemoPath = join(repoRoot, "demo", "router-demo.ts");
const portalDemoPath = join(repoRoot, "demo", "portal-demo.ts");
const componentsPath = join(repoRoot, "demo", "components.ts");

/**
 * Extract { selector, body } pairs from a CSS source. Flat scan: rules nested
 * inside @media blocks are captured too (their selector chunk may include the
 * tail of the enclosing at-rule, which is harmless for the assertions below —
 * we only test selectors that mention a specific host/item string).
 */
function cssRules(source: string): Array<{ selector: string; body: string }> {
	const rules: Array<{ selector: string; body: string }> = [];
	const re = /([^{}]+)\{([^{}]*)\}/g;
	// Strip comments so selector chunks can be matched exactly.
	const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "");
	for (const m of stripped.matchAll(re)) {
		rules.push({ selector: (m[1] ?? "").trim(), body: m[2] ?? "" });
	}
	return rules;
}

describe("D1 — Syntax tree hosts: padding is engine-owned, never CSS", () => {
	test("demo/style.css sets no CSS padding on the Syntax tree hosts", async () => {
		const source = await readFile(styleCssPath, "utf8");

		// The host element of an Axiom tree must not carry CSS padding or
		// sizing (odd/tasks/demo-ui-polish.md, "Reglas de diseño para árboles
		// Axiom en el sidebar", rules 2-3: the engine owns layout). The old
		// `.syntax-panel > div:last-child { padding: 10px }` displaced the
		// absolutely positioned tree root to (10,10) while the engine sized it
		// to the host border-box, clipping the card 10px right/bottom
		// (diagnostic.json: `.syntax-demo-item` beyondRight 11 / beyondBottom
		// 10 in #syntax-h-v2-root and #syntax-h-literal-root). The inset is
		// declared inside the mounted trees (demo/syntax-showcase.ts wrapper
		// with engine `padding: 10`) instead.
		const hostSelectors = /syntax-panel\s*>\s*div:last-child|#syntax-h-v2-root|#syntax-h-literal-root/;
		for (const rule of cssRules(source)) {
			if (hostSelectors.test(rule.selector)) {
				expect(rule.body).not.toMatch(/\bpadding\s*:/);
			}
		}
	});

	test("demo/style.css .syntax-demo-item declares no CSS padding (engine trees declare it via the padding prop)", async () => {
		const source = await readFile(styleCssPath, "utf8");

		// `.syntax-demo-item` is used INSIDE engine trees (syntax showcase,
		// router UsersIndex, JSX demo). CSS padding on an engine node shifts
		// its absolutely positioned children (containing block = padding box)
		// without shrinking their engine-computed width, so the inner rows
		// escaped the root by 13.5px (diagnostic.json, D1). Every tree node
		// that needs an inset declares it with the engine `padding` prop, as
		// demo/context-demo.ts and demo/forms-demo.ts do.
		const rule = cssRules(source).find((r) => /^\.syntax-demo-item$/.test(r.selector));
		expect(rule).toBeDefined();
		expect(rule!.body).not.toMatch(/\bpadding\s*:/);
	});
});

describe("D2 — Grid demo canvas: declared height covers the measured content", () => {
	test("demo/ruta-b-showcase.ts grid canvas declares height >= 200 (measured content requirement)", async () => {
		const source = await readFile(rutaBShowcasePath, "utf8");

		// Content requirement of the 6-cell grid (measured, not by eye):
		//   3 rows × 60px (declared cell height)
		// + 2 row gaps × 6px
		// + 2 × 4px engine padding
		// = 200px.
		// With the old `height: 160` the canvas reported scrollHeight 196 vs
		// clientHeight 160 and cells C/D painted 27px below the root
		// (odd/evidence/release-0.9.14/diagnostic.json, D2).
		const MIN_CANVAS_HEIGHT = 200;
		const m = source.match(/classes:\s*\['grid-demo-canvas'\][\s\S]*?height:\s*(\d+)/);
		expect(m).not.toBeNull();
		expect(Number(m![1])).toBeGreaterThanOrEqual(MIN_CANVAS_HEIGHT);
	});

	test("demo/style.css .ruta-b-grid-container uses outline, not border (a CSS border would shrink clientHeight below the engine-written height)", async () => {
		const source = await readFile(styleCssPath, "utf8");

		// The engine writes `height: <tree height>` inline on the mount host
		// (src/render/commit.ts). With `box-sizing: border-box` and a 1px CSS
		// border, the host clientHeight becomes treeHeight-2 while the canvas
		// child still measures treeHeight → scrollHeight-clientHeight = 2.
		// `outline` gives the same visual line with zero layout cost.
		const rule = cssRules(source).find((r) => /^\.ruta-b-grid-container$/.test(r.selector));
		expect(rule).toBeDefined();
		expect(rule!.body).not.toMatch(/\bborder\s*:/);
		expect(rule!.body).toMatch(/outline\s*:/);
	});
});

describe("D3 — hero-title rows fit the rendered text (26px)", () => {
	test("demo/components.ts pins HeroCard's hero-title row to the shared 26px height", async () => {
		const source = await readFile(componentsPath, "utf8");

		expect(source).toMatch(/export const HERO_TITLE_HEIGHT = 26\b/);
		const heroCard = source.slice(source.indexOf("export const HeroCard ="));
		expect(heroCard).toMatch(/tag:\s*'h2',\s*classes:\s*\['hero-title'\]/);
		expect(heroCard).not.toMatch(/classes:\s*\['hero-title'\](?!,\s*layout:\s*\{\s*height:\s*HERO_TITLE_HEIGHT\s*\})/);
	});

	test("demo/router-demo.ts pins the shared HERO_TITLE_HEIGHT on every hero-title row", async () => {
		const source = await readFile(routerDemoPath, "utf8");

		// `.hero-title` renders 20px font × 1.3 line-height = 26px of text;
		// the engine default row is lineHeight 20, so the h2 overflowed
		// (diagnostic.json: clientH 20 / scrollH 26, delta 6 — "Página no
		// encontrada" in the 404 view). The explicit `height` prop is honored
		// because the parent is a flex stack (demo-ui-polish.md rule 3).
		expect(source).toMatch(/import\s*\{\s*HERO_TITLE_HEIGHT\s*\}\s*from\s*'\.\/components\.ts'/);
		expect(source).not.toMatch(/const HERO_TITLE_HEIGHT\s*=/);
		// Every hero-title node in the file must carry the height.
		expect(source).not.toMatch(/class:\s*\['hero-title'\](?!,\s*height:\s*HERO_TITLE_HEIGHT)/);
	});

	test("demo/portal-demo.ts pins the shared HERO_TITLE_HEIGHT on every hero-title row", async () => {
		const source = await readFile(portalDemoPath, "utf8");

		// Same defect as the router 404 view: "createPortal" h2 rendered 26px
		// of text inside a 20px engine row (diagnostic.json, D3).
		expect(source).toMatch(/import\s*\{\s*HERO_TITLE_HEIGHT\s*\}\s*from\s*'\.\/components\.ts'/);
		expect(source).not.toMatch(/const HERO_TITLE_HEIGHT\s*=/);
		expect(source).not.toMatch(/class:\s*\['hero-title'\](?!,\s*height:\s*HERO_TITLE_HEIGHT)/);
	});
});
