import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const portalDemoPath = join(repoRoot, "demo", "portal-demo.ts");

describe("portal-demo structural integrity", () => {
	test("modal content is wrapped in a .portal-modal container for CSS styling", async () => {
		const source = await readFile(portalDemoPath, "utf8");

		// The CSS in demo/style.css defines .portal-modal for the card appearance
		// (background, border, padding, box-shadow). The ModalPortal component must
		// include a div with class 'portal-modal' to receive those styles.
		expect(source).toContain("'portal-modal'");
	});

	test(".portal-modal wrapper is a direct child of .portal-overlay, not nested inside stack", async () => {
		const source = await readFile(portalDemoPath, "utf8");

		// portal-overlay contains portal-modal which contains the header/body.
		// stack() is INSIDE portal-modal, not the other way around.
		const overlayIdx = source.indexOf("portal-overlay");
		const portalModalIdx = source.indexOf("'portal-modal'");
		const headerIdx = source.indexOf("portal-modal-header");

		// portal-modal class must appear after portal-overlay and before portal-modal-header
		expect(overlayIdx).toBeGreaterThan(-1);
		expect(portalModalIdx).toBeGreaterThan(overlayIdx);
		expect(headerIdx).toBeGreaterThan(portalModalIdx);
	});
});
