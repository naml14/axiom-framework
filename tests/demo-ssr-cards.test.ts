import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const ssrPagePath = join(repoRoot, "demo", "ssr-page.tsx");
const streamingRoutePath = join(repoRoot, "demo", "streaming-route.ts");

describe("SSR demo cards: real padding against the inline margin:0;padding:0 emitted by the engine", () => {
	test("demo/ssr-page.tsx declares 24px padding with !important on .ssr-shell", async () => {
		const source = await readFile(ssrPagePath, "utf8");

		// Without `!important`, the engine's inline `margin:0;padding:0` (set by
		// src/ssr.ts on every element) wins over the stylesheet rule and the
		// card content stays glued to the border. The padding must be declared
		// with `!important` to override the inline engine style.
		expect(source).toContain("padding:24px !important;");
		expect(source).toContain("margin:24px auto !important;");
	});

	test("demo/ssr-page.tsx does not duplicate `margin:24px auto` inside attrs.style", async () => {
		const source = await readFile(ssrPagePath, "utf8");

		// CSS is the single source of truth for the card's margin. Duplicating
		// it inside the JSX `attrs.style` array would let it leak back into
		// the inline style and re-introduce the original drift. The JSX form
		// is `attrs={{ style: [ ... ].join(';') }}`, so we extract the array
		// literal and assert it does not carry the card margin again.
		const styleArrayMatch = source.match(/attrs=\{\{\s*style:\s*\[([^\]]+)\]/);
		expect(styleArrayMatch).not.toBeNull();
		expect(styleArrayMatch![1]).not.toContain("margin:24px auto");
	});

	test("demo/streaming-route.ts declares 24px padding with !important on .ssr-stream-shell", async () => {
		const source = await readFile(streamingRoutePath, "utf8");

		// Same rule as the SSR page: the engine's inline `margin:0;padding:0`
		// kills any rule without `!important`. Centering and padding must both
		// be declared with `!important` so they actually take effect.
		expect(source).toContain("padding:24px !important;");
		expect(source).toContain("margin:0 auto !important;");
		expect(source).toContain("margin:16px 0 !important;");
	});

	test("demo/ssr-page.tsx declares the title chip's padding and margin with !important", async () => {
		const source = await readFile(ssrPagePath, "utf8");

		// `.ssr-chip` is rendered inside an engine-managed element, so the
		// engine's inline `margin:0;padding:0` overrides any rule that lacks
		// `!important`. Measured defect: the pill background hugged its text
		// (`padding: 0px`) and it sat glued to the title (`margin: 0px`).
		// Both properties must use `!important` to survive the inline reset.
		expect(source).toContain("padding:2px 8px !important;");
		expect(source).toContain("margin-left:8px !important;");
	});

	test("demo/streaming-route.ts declares the title chip's padding and margin with !important", async () => {
		const source = await readFile(streamingRoutePath, "utf8");

		// Same root cause as the SSR page chip: the engine's inline
		// `margin:0;padding:0` would otherwise kill the pill's spacing.
		expect(source).toContain("padding:2px 8px !important;");
		expect(source).toContain("margin-left:8px !important;");
	});
});

