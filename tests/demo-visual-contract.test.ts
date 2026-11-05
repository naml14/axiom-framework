import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Source-level guards for the visual refresh (odd/tasks/demo-visual-refresh.md).
//
// These pin the invariants that a visual change can silently break:
//   1. the launcher may not reference a CSS custom property that does not
//      exist (the `--surface-1` / `--shadow-soft` bug left the launcher card
//      with no background and no shadow);
//   2. the CSS line box of engine-owned text must match the height the
//      engine declares for that row (`.hero-title` vs HERO_TITLE_HEIGHT);
//   3. text inside an engine tree keeps a line box <= 20px, the engine grid;
//   4. the tag bubble fits the 20px row the engine declares for it.
//
// The numeric evidence behind these rules lives in the browser probe runs
// described in odd/tasks/demo-visual-refresh.md.

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const styleCssPath = join(repoRoot, "demo", "style.css");
const componentsPath = join(repoRoot, "demo", "components.ts");
const indexHtmlPath = join(repoRoot, "demo", "index.html");
const staticHtmlPath = join(repoRoot, "demo", "static.html");
const domComparisonHtmlPath = join(repoRoot, "demo", "dom-comparison.html");

function cssRules(source: string): Array<{ selector: string; body: string }> {
	const rules: Array<{ selector: string; body: string }> = [];
	const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "");
	for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		rules.push({ selector: (m[1] ?? "").trim(), body: m[2] ?? "" });
	}
	return rules;
}

function rootTokens(source: string): Set<string> {
	const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "");
	const root = stripped.match(/:root\s*\{([\s\S]*?)\}/);
	const tokens = new Set<string>();
	for (const m of (root?.[1] ?? "").matchAll(/--([A-Za-z0-9-]+)\s*:/g)) {
		tokens.add(m[1]!);
	}
	return tokens;
}

function declaredTokens(source: string): Set<string> {
	const tokens = new Set<string>();
	for (const m of source.matchAll(/--([A-Za-z0-9-]+)\s*:/g)) {
		tokens.add(m[1]!);
	}
	return tokens;
}

function tokenValue(source: string, token: string): string {
	const m = source.match(new RegExp(`--${token}\\s*:\\s*(#[0-9a-fA-F]{6})`));
	return m?.[1] ?? "";
}

function hueOf(hex: string): number {
	const n = parseInt(hex.slice(1), 16);
	const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
	const max = Math.max(r, g, b), min = Math.min(r, g, b);
	if (max === min) return 0;
	const d = max - min;
	let h = 0;
	if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
	else if (max === g) h = ((b - r) / d + 2) / 6;
	else h = ((r - g) / d + 4) / 6;
	return h * 360;
}

describe("Demo visual contract — custom properties", () => {
	test("the demo pages reference no undefined CSS custom property", async () => {
		const style = await readFile(styleCssPath, "utf8");
		const defined = declaredTokens(style);

		for (const path of [indexHtmlPath, staticHtmlPath, domComparisonHtmlPath]) {
			// The comparison page is a build artifact and is not in the repository:
			// check it when it exists, skip it otherwise.
			const source = await readFile(path, "utf8").catch(() => null);
			if (source === null) continue;
			const used = new Set<string>();
			for (const m of source.matchAll(/var\(\s*--([A-Za-z0-9-]+)/g)) {
				used.add(m[1]!);
			}
			for (const token of used) {
				expect(defined.has(token)).toBe(true);
			}
		}
	});

	test("the root token block declares the type, spacing, radius and shadow scales", async () => {
		const style = await readFile(styleCssPath, "utf8");
		const tokens = rootTokens(style);

		for (const token of [
			"text-display",
			"text-title",
			"text-body",
			"text-label",
			"text-micro",
			"space-1",
			"space-4",
			"radius-sm",
			"radius-pill",
			"shadow-md",
			"shadow-glow",
		]) {
			expect(tokens.has(token)).toBe(true);
		}
	});
});

describe("Demo visual contract — the palette comes from the logo", () => {
	test("the brand accents stay inside the logo's hue band", async () => {
		const style = await readFile(styleCssPath, "utf8");

		// Measured from the logo pixels (Images/): the saturated colors sit
		// between 186 (cyan #34cadb) and 220 (periwinkle #708ec8), with the
		// primary stroke at 215 (#306fcc). A brand accent outside that band
		// contradicts the logo.
		for (const token of ["accent-blue", "accent-cyan", "accent-indigo"]) {
			const hue = hueOf(tokenValue(style, token));
			expect(hue).toBeGreaterThanOrEqual(180);
			expect(hue).toBeLessThanOrEqual(231);
		}
	});

	test("the warning and danger accents stay outside the logo's hue band", async () => {
		const style = await readFile(styleCssPath, "utf8");

		// The logo has no amber and no rose: color theory places them at the
		// hues farthest from the brand blues. If one of them drifts into the
		// band it stops being distinguishable from a brand accent.
		for (const token of ["accent-amber", "accent-rose"]) {
			const hue = hueOf(tokenValue(style, token));
			expect(hue < 180 || hue > 231).toBe(true);
		}
	});

	test("the accent vocabulary is the logo one, not the previous violet one", async () => {
		const style = await readFile(styleCssPath, "utf8");
		const tokens = rootTokens(style);

		for (const token of ["accent-blue", "accent-cyan", "accent-indigo", "accent-amber", "accent-rose", "accent-blue-deep"]) {
			expect(tokens.has(token)).toBe(true);
		}
		for (const token of ["accent-violet", "accent-teal", "accent-sky"]) {
			expect(tokens.has(token)).toBe(false);
		}
	});
});

describe("Demo visual contract — engine rows", () => {
	test(".hero-title keeps the line box the engine declares for its row", async () => {
		const style = await readFile(styleCssPath, "utf8");
		const components = await readFile(componentsPath, "utf8");

		const declared = components.match(/HERO_TITLE_HEIGHT\s*=\s*(\d+)/);
		expect(declared).not.toBeNull();
		const rowHeight = Number(declared![1]);

		const rule = cssRules(style).find((r) => /^\.hero-title$/.test(r.selector));
		expect(rule).toBeDefined();

		// A px line-height is the contract; a unitless one depends on the
		// font-size and drifts from the engine row as soon as the type scale
		// changes.
		const lineHeight = rule!.body.match(/line-height\s*:\s*(\d+)px/);
		expect(lineHeight).not.toBeNull();
		expect(Number(lineHeight![1])).toBe(rowHeight);
	});

	test("text inside engine trees keeps a line box of at most 20px", async () => {
		const style = await readFile(styleCssPath, "utf8");
		const rules = cssRules(style);

		for (const selector of [".hero-body", ".card-title", ".card-body"]) {
			const rule = rules.find((r) => r.selector === selector);
			expect(rule).toBeDefined();
			const lineHeight = rule!.body.match(/line-height\s*:\s*([\d.]+)px/);
			expect(lineHeight).not.toBeNull();
			expect(Number(lineHeight![1])).toBeLessThanOrEqual(20);
		}
	});

	test(".tag-bubble fits the 20px row the engine declares for it", async () => {
		const style = await readFile(styleCssPath, "utf8");
		const rule = cssRules(style).find((r) => r.selector === ".tag-bubble");
		expect(rule).toBeDefined();

		const lineHeight = rule!.body.match(/line-height\s*:\s*([\d.]+)px/);
		expect(lineHeight).not.toBeNull();
		const border = rule!.body.match(/border\s*:\s*(\d+)px/);
		const borderWidth = border ? Number(border[1]) : 0;

		// 20px row - the border on both sides = the space the line box gets.
		expect(Number(lineHeight![1]) + borderWidth * 2).toBeLessThanOrEqual(20);
	});
});
