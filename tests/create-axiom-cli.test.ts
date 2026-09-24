import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs, USAGE, UsageError } from "../scripts/create-axiom.ts";

const repoRoot = join(import.meta.dir, "..");
const scriptPath = join(repoRoot, "scripts", "create-axiom.ts");
const tempDirs: string[] = [];

async function freshDir(label: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), `axiom-cli-${label}-`));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	for (const dir of tempDirs.splice(0)) {
		await rm(dir, { recursive: true, force: true }).catch(() => {});
	}
});

describe("parseArgs", () => {
	test("returns defaults when called with no arguments", () => {
		expect(parseArgs([])).toEqual({
			projectName: "my-axiom-app",
			force: false,
			install: true,
			help: false,
			version: false,
		});
	});

	test("accepts a single positional project name", () => {
		expect(parseArgs(["my-cool-app"])).toEqual({
			projectName: "my-cool-app",
			force: false,
			install: true,
			help: false,
			version: false,
		});
	});

	test("recognises --help", () => {
		const result = parseArgs(["--help"]);
		expect(result.help).toBe(true);
		expect(result.projectName).toBe("my-axiom-app");
	});

	test("recognises -h", () => {
		const result = parseArgs(["-h"]);
		expect(result.help).toBe(true);
	});

	test("recognises --version", () => {
		const result = parseArgs(["--version"]);
		expect(result.version).toBe(true);
	});

	test("recognises -v", () => {
		const result = parseArgs(["-v"]);
		expect(result.version).toBe(true);
	});

	test("recognises --force", () => {
		expect(parseArgs(["--force"]).force).toBe(true);
	});

	test("recognises -f", () => {
		expect(parseArgs(["-f"]).force).toBe(true);
	});

	test("recognises --no-install", () => {
		expect(parseArgs(["--no-install"]).install).toBe(false);
	});

	test("accepts --force and --no-install together", () => {
		expect(parseArgs(["--force", "--no-install"])).toEqual({
			projectName: "my-axiom-app",
			force: true,
			install: false,
			help: false,
			version: false,
		});
	});

	test("accepts -f and --no-install together", () => {
		expect(parseArgs(["-f", "--no-install"]).force).toBe(true);
		expect(parseArgs(["-f", "--no-install"]).install).toBe(false);
	});

	test("accepts a flag after the positional", () => {
		const result = parseArgs(["my-app", "--force"]);
		expect(result.projectName).toBe("my-app");
		expect(result.force).toBe(true);
	});

	test("accepts a short flag after the positional", () => {
		const result = parseArgs(["my-app", "-f"]);
		expect(result.projectName).toBe("my-app");
		expect(result.force).toBe(true);
	});

	test("accepts --no-install after the positional", () => {
		const result = parseArgs(["my-app", "--no-install"]);
		expect(result.projectName).toBe("my-app");
		expect(result.install).toBe(false);
	});

	test("treats -- as the end of option parsing", () => {
		// After `--` every token is positional, so a flag-looking token becomes the
		// project name instead of raising an unknown-option error.
		const result = parseArgs(["--", "--not-a-flag"]);
		expect(result.projectName).toBe("--not-a-flag");
		expect(result.force).toBe(false);
		expect(result.install).toBe(true);
	});

	test("throws UsageError for an unknown long flag", () => {
		expect(() => parseArgs(["--nope"])).toThrow(UsageError);
	});

	test("throws UsageError for an unknown short flag", () => {
		expect(() => parseArgs(["-z"])).toThrow(UsageError);
	});

	test("throws UsageError for two positional arguments", () => {
		expect(() => parseArgs(["one", "two"])).toThrow(UsageError);
	});

	test("UsageError carries a descriptive message", () => {
		try {
			parseArgs(["--bogus"]);
			throw new Error("parseArgs should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(UsageError);
			expect((err as Error).message).toContain("--bogus");
		}
	});
});

describe("USAGE string", () => {
	test("is exported as a non-empty string", () => {
		expect(typeof USAGE).toBe("string");
		expect(USAGE.length).toBeGreaterThan(0);
	});

	test("mentions every flag by its long and short form", () => {
		expect(USAGE).toContain("--help");
		expect(USAGE).toContain("-h");
		expect(USAGE).toContain("--version");
		expect(USAGE).toContain("-v");
		expect(USAGE).toContain("--force");
		expect(USAGE).toContain("-f");
		expect(USAGE).toContain("--no-install");
	});

	test("mentions the positional project-name argument", () => {
		expect(USAGE).toContain("project-name");
		expect(USAGE).toContain("my-axiom-app");
	});

	test("contains at least two usage examples", () => {
		const exampleLines = USAGE.split("\n").filter((line) =>
			line.trim().startsWith("create-axiom"),
		);
		expect(exampleLines.length).toBeGreaterThanOrEqual(2);
	});

	test("has no trailing whitespace on any line", () => {
		for (const line of USAGE.split("\n")) {
			expect(line).toBe(line.replace(/\s+$/, ""));
		}
	});
});

describe("create-axiom CLI process", () => {
	async function runCli(
		args: string[],
		options: { cwd?: string } = {},
	): Promise<{ exitCode: number; stdout: string; stderr: string }> {
		const proc = Bun.spawn(["bun", "run", scriptPath, ...args], {
			cwd: options.cwd ?? repoRoot,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		return { exitCode, stdout, stderr };
	}

	test("--help exits 0 and prints USAGE before touching the filesystem", async () => {
		const workspace = await freshDir("help");
		// Pass a project name that would create files — it must NOT run.
		const result = await runCli(["--help", "would-create-this"], {
			cwd: workspace,
		});

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Usage:");
		expect(result.stdout).toContain("--help");
		expect(result.stdout).toContain("--version");
		expect(result.stdout).toContain("--force");
		expect(result.stdout).toContain("--no-install");
		expect(existsSync(join(workspace, "would-create-this"))).toBe(false);
	});

	test("-h exits 0 and prints USAGE", async () => {
		const result = await runCli(["-h"]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Usage:");
	});

	test("--version exits 0 and prints the framework version from package.json", async () => {
		const rootPackage = JSON.parse(
			await readFile(join(repoRoot, "package.json"), "utf8"),
		) as { version: string };

		const result = await runCli(["--version"]);

		expect(result.exitCode).toBe(0);
		expect(result.stdout.trim()).toBe(rootPackage.version);
	});

	test("-v exits 0 and prints the framework version", async () => {
		const rootPackage = JSON.parse(
			await readFile(join(repoRoot, "package.json"), "utf8"),
		) as { version: string };

		const result = await runCli(["-v"]);

		expect(result.exitCode).toBe(0);
		expect(result.stdout.trim()).toBe(rootPackage.version);
	});

	test("--help works even when a project name is also passed", async () => {
		const workspace = await freshDir("help-with-name");
		const result = await runCli(["--help", "ignored-name"], {
			cwd: workspace,
		});

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Usage:");
		expect(existsSync(join(workspace, "ignored-name"))).toBe(false);
	});

	test("--version works even when a project name is also passed", async () => {
		const result = await runCli(["--version", "ignored-name"]);
		expect(result.exitCode).toBe(0);
		// stdout should be the version, not "ignored-name"
		expect(result.stdout).not.toContain("ignored-name");
	});

	test("--no-install scaffolds the project without running bun install", async () => {
		const workspace = await freshDir("no-install");
		const projectName = "no-install-fixture";
		const projectDir = join(workspace, projectName);

		const result = await runCli(["--no-install", projectName], {
			cwd: workspace,
		});

		expect(result.exitCode).toBe(0);
		// Files scaffolded
		const packageJson = JSON.parse(
			await readFile(join(projectDir, "package.json"), "utf8"),
		) as { name?: string };
		expect(packageJson.name).toBe(projectName);
		const appTs = await readFile(join(projectDir, "src", "app.ts"), "utf8");
		expect(appTs.length).toBeGreaterThan(0);

		// No node_modules created (no install ran)
		expect(existsSync(join(projectDir, "node_modules"))).toBe(false);

		// User is told how to install manually
		expect(result.stdout).toContain("bun install");
		// The "Dependencies installed" message must NOT appear
		expect(result.stdout).not.toContain("Dependencies installed");
	});

	test("--no-install accepts the flag after the positional", async () => {
		const workspace = await freshDir("no-install-after-positional");
		const projectName = "flag-after-positional";
		const projectDir = join(workspace, projectName);

		const result = await runCli([projectName, "--no-install"], {
			cwd: workspace,
		});

		expect(result.exitCode).toBe(0);
		expect(existsSync(join(projectDir, "package.json"))).toBe(true);
		expect(existsSync(join(projectDir, "node_modules"))).toBe(false);
		expect(result.stdout).toContain("bun install");
	});

	test("an unknown flag exits 1, writes to stderr, and creates nothing on disk", async () => {
		const workspace = await freshDir("unknown-flag");

		const result = await runCli(["--definitely-not-a-flag"], {
			cwd: workspace,
		});

		expect(result.exitCode).toBe(1);
		// Error message on stderr hints at --help
		expect(result.stderr).toContain("--help");
		// No files written in the workspace
		const entries = await Array.fromAsync(
			new Bun.Glob("*").scan({ cwd: workspace }),
		);
		// mkdtemp creates an empty temp dir; nothing should be added.
		expect(entries.length).toBe(0);
	});

	test("two positional arguments exit 1 with a usage hint on stderr", async () => {
		const result = await runCli(["one", "two"]);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("--help");
	});
});
