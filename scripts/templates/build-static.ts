#!/usr/bin/env bun
/**
 * Static site generation script.
 *
 * Usage:
 *   bun run build
 *
 * Uses buildStatic() from axiom-framework to generate static HTML.
 * Customize the routes and metadata for your site.
 *
 * See: https://github.com/naml14/axiom-framework#static-site-generation
 */

import { readFile } from "node:fs/promises";
import { buildStatic, defineComponent, stack, h } from "axiom-framework";

const starterStyles = await readFile(
	new URL("./src/styles.css", import.meta.url),
	"utf8",
);

const HomePage = defineComponent(() =>
	stack(
		{ gap: 12, padding: 20 },
		h("h1", null, "{{PROJECT_NAME}}"),
		h("p", null, "Static site generated with axiom-framework."),
	),
);

const result = await buildStatic({
	routes: [
		{
			path: "/",
			component: HomePage,
			metadata: {
				title: "{{PROJECT_NAME}}",
				description: "Built with axiom-framework",
				inlineStyles: starterStyles,
			},
		},
	],
	outDir: "./dist",
	minify: true,
});

console.log(
	`Built ${result.routes} route(s), ${result.files.length} file(s) in ${result.durationMs}ms`,
);
