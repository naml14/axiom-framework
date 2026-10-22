import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const styleCssPath = join(repoRoot, "demo", "style.css");
const controlsPath = join(repoRoot, "demo", "controls.ts");
const rutaBPath = join(repoRoot, "demo", "ruta-b-showcase.ts");

async function cssRule(source: string, selector: string): Promise<string> {
	const pattern = new RegExp(`(?:^|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "m");
	const match = source.match(pattern);
	return match?.[1] ?? "";
}

/** Extracts the at-rule body starting at `index`, balancing nested braces. */
function atRuleBody(source: string, index: number): string | undefined {
	const open = source.indexOf("{", index);
	if (open === -1) return undefined;
	let depth = 0;
	for (let i = open; i < source.length; i++) {
		if (source[i] === "{") depth++;
		else if (source[i] === "}") {
			depth--;
			if (depth === 0) return source.slice(index, i + 1);
		}
	}
	return undefined;
}

describe("Demo viewport fit: the canvas must stay reachable on narrow viewports", () => {
	test("demo/style.css does not clip the horizontal overflow of the canvas host", async () => {
		const css = await readFile(styleCssPath, "utf8");
		const main = await cssRule(css, ".dashboard-main");

		// The engine writes the canvas width as a fixed pixel width on #app.
		// The host region used to hide the horizontal overflow, so on a
		// viewport narrower than the canvas the excess was clipped with no
		// way to reach it.
		expect(main).not.toContain("overflow-x: hidden");
		expect(main).toContain("overflow-x: auto");
	});

	test("demo/style.css stacks the dashboard on narrow viewports", async () => {
		const css = await readFile(styleCssPath, "utf8");
		const mediaBlocks = [...css.matchAll(/@media/g)]
			.map((m) => atRuleBody(css, m.index))
			.filter((block): block is string => block !== undefined);

		expect(mediaBlocks.length).toBeGreaterThan(0);
		const narrow = mediaBlocks.find((block) => /max-width:\s*(9|10|11)\d\dpx/.test(block));
		expect(narrow).toBeDefined();

		// Stacked: the sidebar becomes a band on top and the canvas host takes
		// the full width, instead of a fixed 340px column eating the viewport.
		expect(narrow).toContain(".dashboard-layout");
		expect(narrow).toContain("flex-direction: column");
		expect(narrow).toContain(".dashboard-sidebar");
	});

	test("demo/controls.ts fits the canvas to the width the host region offers", async () => {
		const source = await readFile(controlsPath, "utf8");

		// The canvas width is chosen with a slider, but the engine never
		// shrinks it to fit: it measures and writes it as given. The demo
		// therefore has to clamp it to the space the host actually offers,
		// and keep the slider in sync so the control does not lie.
		expect(source).toContain("clientWidth");
		expect(source).toContain("containerWidth.value =");
		expect(source).toMatch(/addEventListener\(\s*["']resize["']/);

		// The slider, the readout and the canvas must move together: a
		// clamped canvas with a slider still showing the old width makes the
		// control lie about the current state.
		const fit = source.match(/function fitCanvasWidth\(\): void \{([\s\S]*?)\n  \}/)?.[1] ?? "";
		expect(fit).toContain("containerWidth.value =");
		expect(fit).toContain("widthSlider.value =");
		expect(fit).toContain("widthDisplay.textContent =");
		expect(fit).toContain("syncContainerWidth(");
	});
});

describe("Demo grid controls: a button at its bound must not look broken", () => {
	test("demo/ruta-b-showcase.ts disables the grid buttons when they cannot act", async () => {
		const source = await readFile(rutaBPath, "utf8");

		// The grid starts at its cap (6 of 6 cells), so "+Celda" had nothing
		// to do and looked broken. The buttons must reflect the margin.
		expect(source).toContain("addBtn.disabled");
		expect(source).toContain("removeBtn.disabled");
	});
});
