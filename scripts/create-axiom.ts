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

const SAFE_NAME_RE = /^[a-z0-9][a-z0-9._-]*$/i;

// ============================================================
// CLI surface (parser + usage)
// ============================================================

export class UsageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UsageError";
	}
}

export interface CliOptions {
	projectName: string;
	force: boolean;
	install: boolean;
	help: boolean;
	version: boolean;
}

export function parseArgs(argv: string[]): CliOptions {
	const options: CliOptions = {
		projectName: "my-axiom-app",
		force: false,
		install: true,
		help: false,
		version: false,
	};

	const positionals: string[] = [];
	let endedOptions = false;

	for (const arg of argv) {
		if (endedOptions) {
			positionals.push(arg);
			continue;
		}

		if (arg === "--") {
			endedOptions = true;
			continue;
		}

		if (arg === "--help" || arg === "-h") {
			options.help = true;
			continue;
		}

		if (arg === "--version" || arg === "-v") {
			options.version = true;
			continue;
		}

		if (arg === "--force" || arg === "-f") {
			options.force = true;
			continue;
		}

		if (arg === "--no-install") {
			options.install = false;
			continue;
		}

		if (arg.startsWith("-")) {
			throw new UsageError(`Unknown option: ${arg}`);
		}

		positionals.push(arg);
	}

	if (positionals.length > 1) {
		throw new UsageError(
			`Expected at most one project name, got ${positionals.length}: ${positionals.join(", ")}`,
		);
	}

	if (positionals.length === 1) {
		options.projectName = positionals[0]!;
	}

	return options;
}

export const USAGE = `Usage: create-axiom [project-name] [options]

  Scaffold a new axiom-framework project into a fresh directory.

Arguments:
  project-name      Directory to create (default: my-axiom-app).
                    Allowed characters: ASCII letters, digits, dot, dash, underscore.
                    Must start with a letter or digit.

Options:
  -f, --force       Overwrite files in an existing project directory
      --no-install  Skip dependency installation (run 'bun install' yourself)
  -h, --help        Show this help and exit
  -v, --version     Print the framework version and exit

Examples:
  create-axiom my-app
  create-axiom my-app --no-install
  create-axiom --force
`;

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

		if (src === "index.html") {
			final = content.replaceAll("{{PROJECT_NAME}}", projectName)
		}

		if (src === "src/app.ts") {
			final = content.replaceAll("'{{PROJECT_NAME}}'", `'${projectName}'`)
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
	let options: CliOptions;
	try {
		options = parseArgs(process.argv.slice(2));
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(message);
		console.error(`Run 'create-axiom --help' for usage information.`);
		process.exit(1);
	}

	if (options.help) {
		console.log(USAGE);
		process.exit(0);
	}

	if (options.version) {
		const version = await getCurrentFrameworkVersion();
		console.log(version);
		process.exit(0);
	}

	const projectName = options.projectName;

	if (!SAFE_NAME_RE.test(projectName)) {
		throw new Error(
			`Invalid project name: "${projectName}". Use only alphanumeric characters, dots, dashes, and underscores.`,
		);
	}

	const projectDir = join(process.cwd(), projectName);

	console.log(`\n  Creating Axiom project: ${projectName}\n`);

	await scaffoldProject(projectDir, projectName);

	if (options.install) {
		console.log(`\n  Installing dependencies...`);
		const exitCode = installProjectDependencies(projectDir);

		if (exitCode !== 0) {
			console.error(
				`  Install failed. Run 'bun install' manually in ${projectDir}`,
			);
		} else {
			console.log(`  Dependencies installed`);
		}
	} else {
		console.log(`\n  Skipped dependency installation.`);
		console.log(`  Run 'bun install' inside ${projectName} when you are ready.`);
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
