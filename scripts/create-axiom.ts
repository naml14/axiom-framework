#!/usr/bin/env bun

// ============================================================
// create-axiom — scaffold a new axiom-framework project
// ============================================================

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "templates");
const ROOT_PACKAGE_JSON_PATH = join(__dirname, "..", "package.json");

async function getCurrentFrameworkVersion(): Promise<string> {
	const rootPackage = JSON.parse(
		await readFile(ROOT_PACKAGE_JSON_PATH, "utf8"),
	) as { version?: string };

	if (!rootPackage.version) {
		throw new Error("Could not determine the current axiom-framework version");
	}

	return rootPackage.version;
}

export const TEMPLATE_FILES: Array<[string, string]> = [
	["package.json", "package.json"],
	["tsconfig.json", "tsconfig.json"],
	["build-static.ts", "build-static.ts"],
	["dev-server.ts", "dev-server.ts"],
	["src/app.ts", "src/app.ts"],
	["src/styles.css", "src/styles.css"],
	["index.html", "index.html"],
];

export async function scaffoldProject(
	projectDir: string,
	projectName: string,
): Promise<void> {
	await mkdir(projectDir, { recursive: true });
	await mkdir(join(projectDir, "src"), { recursive: true });
	const frameworkVersion = await getCurrentFrameworkVersion();

	for (const [src, dest] of TEMPLATE_FILES) {
		const content = await readFile(join(TEMPLATES_DIR, src), "utf8");
		let final = content;

		if (src === "package.json") {
			const pkg = JSON.parse(content) as {
				name?: string;
				dependencies?: Record<string, string>;
			};
			pkg.name = projectName;
			pkg.dependencies = {
				...(pkg.dependencies ?? {}),
				"axiom-framework": frameworkVersion,
			};
			final = `${JSON.stringify(pkg, null, 2)}\n`;
		}

		await writeFile(join(projectDir, dest), final, "utf8");
		console.log(`  Created ${dest}`);
	}
}

export function installProjectDependencies(projectDir: string): number {
	const install = Bun.spawnSync(["bun", "install"], {
		cwd: projectDir,
		stdout: "inherit",
		stderr: "inherit",
	});
	return install.exitCode;
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const projectName = args[0] || "my-axiom-app";
	const projectDir = join(process.cwd(), projectName);

	console.log(`\n  Creating Axiom project: ${projectName}\n`);

	await scaffoldProject(projectDir, projectName);

	console.log(`\n  Installing dependencies...`);
	const exitCode = installProjectDependencies(projectDir);

	if (exitCode !== 0) {
		console.error(
			`  Install failed. Run 'bun install' manually in ${projectDir}`,
		);
	} else {
		console.log(`  Dependencies installed`);
	}

	console.log(`\n  Ready! Run:\n`);
	console.log(`    cd ${projectName}`);
	console.log(`    bun dev\n`);
}

if (import.meta.main) {
	main().catch((err) => {
		console.error("Failed to create project:", err);
		process.exit(1);
	});
}
