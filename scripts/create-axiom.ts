#!/usr/bin/env bun

// ============================================================
// create-axiom — scaffold a new axiom-framework project
// ============================================================

import { mkdir, writeFile, readFile, readdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "templates");
const ROOT_PACKAGE_JSON_PATH = join(__dirname, "..", "package.json");

const SAFE_NAME_RE = /^[a-z0-9][a-z0-9._-]*$/i;

// Windows reserved device names (with or without an extension). A directory
// whose base name matches any of these cannot be created on Windows, so
// reject them on every platform: a project with such a name cannot be
// checked out cross-platform.
const WINDOWS_RESERVED_BASES: ReadonlySet<string> = new Set([
	"con",
	"prn",
	"aux",
	"nul",
	...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
	...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
]);

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
                    Windows reserved device names (con, prn, aux, nul, com1-9, lpt1-9) are rejected.

Options:
  -f, --force       Overwrite template files in an existing project directory
      --no-install  Skip dependency installation (run 'bun install' yourself)
  -h, --help        Show this help and exit
  -v, --version     Print the framework version and exit

When the target directory already exists and is not empty, the CLI asks
for confirmation on a TTY. In non-interactive contexts (CI, pipes) it
aborts with exit 1 unless --force is supplied.

Examples:
  create-axiom my-app
  create-axiom my-app --no-install
  create-axiom my-app --force
`;

// ============================================================
// Project name validation (T3)
// ============================================================

export function validateProjectName(name: string): void {
	// Check for a trailing dot or space first so the user gets a Windows-
	// specific error message instead of the generic "ASCII characters" one
	// that the regex would otherwise produce for trailing spaces. Without
	// this, a name ending in a space would hit SAFE_NAME_RE before the
	// dedicated trailing-dot/space branch and the actionable message would
	// be lost.
	if (name.endsWith(".") || name.endsWith(" ")) {
		throw new UsageError(
			`Invalid project name: "${name}". ` +
				`A trailing dot or space is invalid because Windows strips ` +
				`them, so the directory you would get would not match the name you typed. ` +
				`Pick a different name, for example my-axiom-app.`,
		);
	}

	if (!SAFE_NAME_RE.test(name)) {
		throw new UsageError(
			`Invalid project name: "${name}". ` +
				`Use ASCII letters, digits, dot, dash, underscore, ` +
				`and start with a letter or digit. Example: my-axiom-app.`,
		);
	}

	const dotIndex = name.indexOf(".");
	const baseName = (dotIndex === -1 ? name : name.slice(0, dotIndex)).toLowerCase();
	if (WINDOWS_RESERVED_BASES.has(baseName)) {
		throw new UsageError(
			`Invalid project name: "${name}". ` +
				`"${baseName.toUpperCase()}" is a reserved device name on Windows ` +
				`(with or without an extension), so a directory with this name ` +
				`cannot be created. Pick a different name, for example my-axiom-app.`,
		);
	}
}

// ============================================================
// Destination directory guard (T2)
// ============================================================

export interface ResolveExistingDirectoryArgs {
	projectDir: string;
	force: boolean;
	isTTY: boolean;
	confirm: (prompt: string) => Promise<boolean>;
}

export type ResolveExistingDirectoryOutcome =
	| { kind: "proceed"; reason: "absent" | "empty" | "forced" | "confirmed" }
	| { kind: "cancel" }
	| { kind: "error"; code: "not-a-directory" | "non-interactive-exists" };

export async function resolveExistingDirectory(
	args: ResolveExistingDirectoryArgs,
): Promise<ResolveExistingDirectoryOutcome> {
	let exists = false;
	let isDirectory = false;
	let isEmpty = false;

	try {
		const stats = await stat(args.projectDir);
		exists = true;
		isDirectory = stats.isDirectory();
		if (isDirectory) {
			const entries = await readdir(args.projectDir);
			isEmpty = entries.length === 0;
		}
	} catch (err) {
		const code = (err as NodeJS.ErrnoException | undefined)?.code;
		if (code !== "ENOENT") {
			throw err;
		}
		exists = false;
	}

	// Edge case: the path exists but is not a directory (e.g. a regular file).
	if (exists && !isDirectory) {
		return { kind: "error", code: "not-a-directory" };
	}

	// Case 1: path does not exist.
	if (!exists) {
		return { kind: "proceed", reason: "absent" };
	}

	// Case 2: path exists, is empty.
	if (isEmpty) {
		return { kind: "proceed", reason: "empty" };
	}

	// Case 3: --force was passed.
	if (args.force) {
		return { kind: "proceed", reason: "forced" };
	}

	// Case 5: non-interactive context without --force.
	if (!args.isTTY) {
		return { kind: "error", code: "non-interactive-exists" };
	}

	// Case 4: TTY prompt.
	const confirmed = await args.confirm(
		`  Directory "${args.projectDir}" already exists and is not empty.\n` +
			`  Overwrite template files? [y/N] `,
	);
	if (confirmed) {
		return { kind: "proceed", reason: "confirmed" };
	}
	return { kind: "cancel" };
}

async function ttyConfirm(
	prompt: string,
	input: NodeJS.ReadableStream = process.stdin,
	output: NodeJS.WritableStream = process.stdout,
): Promise<boolean> {
	const rl = createInterface({
		input,
		output,
	});
	try {
		return await new Promise<boolean>((resolve) => {
			// Settle at most once: either the next 'line' wins, or 'close'
			// (EOF/Ctrl+D/closed pipe) settles as `false`. Listening on
			// 'line' directly avoids relying on `rl.question()`, which in
			// Bun's readline fires 'close' before the question promise can
			// resolve on buffered input, and which never settles at all on
			// an empty input stream.
			let settled = false;
			const settle = (answer: boolean) => {
				if (settled) {
					return;
				}
				settled = true;
				resolve(answer);
			};
			rl.once("line", (line) => {
				const trimmed = line.trim().toLowerCase();
				settle(trimmed === "y" || trimmed === "yes");
			});
			rl.once("close", () => settle(false));
			// Write the prompt straight to the output so it does not mix
			// with the user's input in the 'line' event payload.
			output.write(prompt);
		});
	} finally {
		// Close exactly once. Idempotent on an already-closed interface.
		rl.close();
	}
}

export { ttyConfirm };

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

	try {
		validateProjectName(projectName);
	} catch (err) {
		// Surface the actionable message verbatim on stderr and exit 1.
		// No 'Failed to create project:' prefix — the user can act on it
		// directly, and the filesystem has not been touched yet.
		const message = err instanceof Error ? err.message : String(err);
		console.error(message);
		process.exit(1);
	}

	const projectDir = join(process.cwd(), projectName);

	const outcome = await resolveExistingDirectory({
		projectDir,
		force: options.force,
		isTTY: Boolean(process.stdin.isTTY),
		confirm: ttyConfirm,
	});

	if (outcome.kind === "error") {
		if (outcome.code === "not-a-directory") {
			console.error(
				`  Error: "${projectDir}" exists but is not a directory.`,
			);
			console.error(
				`  Remove or rename it, then re-run create-axiom.`,
			);
		} else {
			console.error(
				`  Error: "${projectDir}" already exists and is not empty.`,
			);
			console.error(
				`  Re-run with --force to overwrite template files, or remove it first.`,
			);
		}
		process.exit(1);
	}

	if (outcome.kind === "cancel") {
		console.log("  Cancelled. No files were written.");
		process.exit(0);
	}

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
