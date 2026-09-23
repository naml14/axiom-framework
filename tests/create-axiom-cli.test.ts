import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import {
	parseArgs,
	resolveExistingDirectory,
	ttyConfirm,
	USAGE,
	UsageError,
	validateProjectName,
} from "../scripts/create-axiom.ts";
import { installLocalFrameworkFixture } from "./helpers/local-framework-fixture.ts";

const repoRoot = join(import.meta.dir, "..");
const scriptPath = join(repoRoot, "scripts", "create-axiom.ts");
const tempDirs: string[] = [];

async function freshDir(label: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), `axiom-cli-${label}-`));
	tempDirs.push(dir);
	return dir;
}

// Recursive walk: returns sorted, root-relative paths (using "/" as the
// separator) for every entry under `cwd`, files and directories alike.
// Implemented with per-level `readdir(..., { withFileTypes: true })` so we
// own the path strings — `readdir({ recursive: true })` in Bun returns bare
// basenames, which keeps both entries but loses their identity: `a/same` and
// `b/same` both come back as `same`, so a move between directories is
// invisible. Symlinks are reported but not descended into (isDirectory() is
// false for symlinks).
async function listEntries(cwd: string): Promise<string[]> {
	const out: string[] = [];
	const walk = async (dir: string, prefix: string): Promise<void> => {
		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
			out.push(relPath);
			if (entry.isDirectory()) {
				await walk(join(dir, entry.name), relPath);
			}
		}
	};
	await walk(cwd, "");
	out.sort();
	return out;
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
		// No files written in the workspace. The shared listEntries helper
		// recurses with per-level readdir so hidden dotfiles, nested files
		// and empty directories are all visible.
		const entries = await listEntries(workspace);
		// mkdtemp creates an empty temp dir; nothing should be added.
		expect(entries.length).toBe(0);
	});

	test("two positional arguments exit 1 with a usage hint on stderr", async () => {
		const result = await runCli(["one", "two"]);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("--help");
	});
});

// ------------------------------------------------------------
// T2 — destination directory guard
// ------------------------------------------------------------

describe("resolveExistingDirectory", () => {
	function makeConfirmRecorder(
		answer: boolean,
	): { confirm: (prompt: string) => Promise<boolean>; calls: string[] } {
		const calls: string[] = [];
		return {
			calls,
			confirm: async (prompt: string) => {
				calls.push(prompt);
				return answer;
			},
		};
	}

	test("case 1: missing path proceeds without prompting", async () => {
		const workspace = await freshDir("resolve-missing");
		const projectDir = join(workspace, "never-created");
		const { confirm, calls } = makeConfirmRecorder(true);

		const outcome = await resolveExistingDirectory({
			projectDir,
			force: false,
			isTTY: true,
			confirm,
		});

		expect(outcome).toEqual({ kind: "proceed", reason: "absent" });
		expect(calls.length).toBe(0);
	});

	test("case 1: missing path proceeds even without a TTY", async () => {
		const workspace = await freshDir("resolve-missing-no-tty");
		const projectDir = join(workspace, "never-created");
		const { confirm, calls } = makeConfirmRecorder(true);

		const outcome = await resolveExistingDirectory({
			projectDir,
			force: false,
			isTTY: false,
			confirm,
		});

		expect(outcome).toEqual({ kind: "proceed", reason: "absent" });
		expect(calls.length).toBe(0);
	});

	test("case 2: empty directory proceeds without prompting", async () => {
		const workspace = await freshDir("resolve-empty");
		const projectDir = join(workspace, "empty");
		await mkdir(projectDir, { recursive: true });
		const { confirm, calls } = makeConfirmRecorder(true);

		const outcome = await resolveExistingDirectory({
			projectDir,
			force: false,
			isTTY: true,
			confirm,
		});

		expect(outcome).toEqual({ kind: "proceed", reason: "empty" });
		expect(calls.length).toBe(0);
	});

	test("case 2: empty directory proceeds even without --force or TTY", async () => {
		const workspace = await freshDir("resolve-empty-bare");
		const projectDir = join(workspace, "empty");
		await mkdir(projectDir, { recursive: true });
		const { confirm, calls } = makeConfirmRecorder(true);

		const outcome = await resolveExistingDirectory({
			projectDir,
			force: false,
			isTTY: false,
			confirm,
		});

		expect(outcome).toEqual({ kind: "proceed", reason: "empty" });
		expect(calls.length).toBe(0);
	});

	test("case 3: existing directory with content proceeds when --force is set", async () => {
		const workspace = await freshDir("resolve-forced");
		const projectDir = join(workspace, "occupied");
		await mkdir(projectDir, { recursive: true });
		await writeFile(join(projectDir, "user.txt"), "keep me", "utf8");
		const { confirm, calls } = makeConfirmRecorder(false);

		const outcome = await resolveExistingDirectory({
			projectDir,
			force: true,
			isTTY: false,
			confirm,
		});

		expect(outcome).toEqual({ kind: "proceed", reason: "forced" });
		// Force is the whole point: we must never prompt.
		expect(calls.length).toBe(0);
	});

	test("case 4: TTY + yes answer proceeds and calls confirm exactly once", async () => {
		const workspace = await freshDir("resolve-tty-yes");
		const projectDir = join(workspace, "occupied");
		await mkdir(projectDir, { recursive: true });
		await writeFile(join(projectDir, "user.txt"), "keep me", "utf8");
		const { confirm, calls } = makeConfirmRecorder(true);

		const outcome = await resolveExistingDirectory({
			projectDir,
			force: false,
			isTTY: true,
			confirm,
		});

		expect(outcome).toEqual({ kind: "proceed", reason: "confirmed" });
		expect(calls.length).toBe(1);
		expect(calls[0]).toContain(projectDir);
	});

	test("confirm receives a prompt that contains the directory path", async () => {
		const workspace = await freshDir("resolve-tty-prompt");
		const projectDir = join(workspace, "occupied");
		await mkdir(projectDir, { recursive: true });
		await writeFile(join(projectDir, "user.txt"), "keep me", "utf8");
		const { confirm, calls } = makeConfirmRecorder(true);

		await resolveExistingDirectory({
			projectDir,
			force: false,
			isTTY: true,
			confirm,
		});

		expect(calls.length).toBe(1);
		expect(calls[0]).toContain(projectDir);
		// The prompt is a y/N prompt
		expect(calls[0]!.toLowerCase()).toMatch(/y\/n/);
	});

	test("case 4: TTY + a declined answer cancels", async () => {
		const workspace = await freshDir("resolve-tty-empty");
		const projectDir = join(workspace, "occupied");
		await mkdir(projectDir, { recursive: true });
		await writeFile(join(projectDir, "user.txt"), "keep me", "utf8");
		const { confirm, calls } = makeConfirmRecorder(false);

		const outcome = await resolveExistingDirectory({
			projectDir,
			force: false,
			isTTY: true,
			confirm,
		});

		expect(outcome).toEqual({ kind: "cancel" });
		expect(calls.length).toBe(1);
	});

	test("case 4: TTY + no answer cancels and calls confirm exactly once", async () => {
		const workspace = await freshDir("resolve-tty-no");
		const projectDir = join(workspace, "occupied");
		await mkdir(projectDir, { recursive: true });
		await writeFile(join(projectDir, "user.txt"), "keep me", "utf8");
		const { confirm, calls } = makeConfirmRecorder(false);

		const outcome = await resolveExistingDirectory({
			projectDir,
			force: false,
			isTTY: true,
			confirm,
		});

		expect(outcome).toEqual({ kind: "cancel" });
		expect(calls.length).toBe(1);
	});

	test("case 5: non-TTY + non-force errors and never prompts", async () => {
		const workspace = await freshDir("resolve-non-tty");
		const projectDir = join(workspace, "occupied");
		await mkdir(projectDir, { recursive: true });
		await writeFile(join(projectDir, "user.txt"), "keep me", "utf8");
		const { confirm, calls } = makeConfirmRecorder(true);

		const outcome = await resolveExistingDirectory({
			projectDir,
			force: false,
			isTTY: false,
			confirm,
		});

		expect(outcome).toEqual({
			kind: "error",
			code: "non-interactive-exists",
		});
		expect(calls.length).toBe(0);
	});

	test("non-directory path always errors, even with --force", async () => {
		const workspace = await freshDir("resolve-not-dir");
		const blocker = join(workspace, "blocker");
		await writeFile(blocker, "I am a file", "utf8");
		const { confirm, calls } = makeConfirmRecorder(true);

		const outcome = await resolveExistingDirectory({
			projectDir: blocker,
			force: true,
			isTTY: true,
			confirm,
		});

		expect(outcome).toEqual({
			kind: "error",
			code: "not-a-directory",
		});
		expect(calls.length).toBe(0);
	});

	test("non-directory path errors without --force too", async () => {
		const workspace = await freshDir("resolve-not-dir-noforce");
		const blocker = join(workspace, "blocker");
		await writeFile(blocker, "I am a file", "utf8");
		const { confirm, calls } = makeConfirmRecorder(true);

		const outcome = await resolveExistingDirectory({
			projectDir: blocker,
			force: false,
			isTTY: true,
			confirm,
		});

		expect(outcome).toEqual({
			kind: "error",
			code: "not-a-directory",
		});
		expect(calls.length).toBe(0);
	});
});

describe("create-axiom CLI — destination directory guard", () => {
	test("non-empty pre-existing directory, no TTY: exits 1, stderr names --force, no template files written", async () => {
		const workspace = await freshDir("process-non-tty");
		const projectName = "occupied-app";
		const projectDir = join(workspace, projectName);
		await mkdir(projectDir, { recursive: true });
		const userFile = join(projectDir, "user.txt");
		await writeFile(userFile, "do-not-touch", "utf8");

		const proc = Bun.spawn(
			["bun", "run", scriptPath, "--no-install", projectName],
			{
				cwd: workspace,
				stdin: "ignore",
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);

		expect(exitCode).toBe(1);
		// Error names the directory and the --force escape hatch
		expect(stderr).toContain(projectDir);
		expect(stderr).toContain("--force");
		// Pre-existing file is untouched
		expect(await readFile(userFile, "utf8")).toBe("do-not-touch");
		// No template files were written
		expect(existsSync(join(projectDir, "package.json"))).toBe(false);
		expect(existsSync(join(projectDir, "index.html"))).toBe(false);
		expect(existsSync(join(projectDir, "src"))).toBe(false);
		// Nothing installed
		expect(existsSync(join(projectDir, "node_modules"))).toBe(false);
		// Sanity: stdout does not claim success
		expect(stdout.toLowerCase()).not.toContain("ready");
	});

	test("non-empty pre-existing directory + --force: exits 0, user file intact, template files written", async () => {
		const workspace = await freshDir("process-force");
		const projectName = "occupied-app";
		const projectDir = join(workspace, projectName);
		await mkdir(projectDir, { recursive: true });
		const userFile = join(projectDir, "user.txt");
		await writeFile(userFile, "do-not-touch", "utf8");

		const proc = Bun.spawn(
			["bun", "run", scriptPath, "--no-install", "--force", projectName],
			{
				cwd: workspace,
				stdin: "ignore",
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);

		expect(exitCode).toBe(0);
		expect(stderr.length).toBe(0);
		// Pre-existing user file is unchanged
		expect(await readFile(userFile, "utf8")).toBe("do-not-touch");
		// Template files were written
		expect(existsSync(join(projectDir, "package.json"))).toBe(true);
		expect(existsSync(join(projectDir, "index.html"))).toBe(true);
		expect(existsSync(join(projectDir, "src", "app.ts"))).toBe(true);
		// Personalised title
		const html = await readFile(join(projectDir, "index.html"), "utf8");
		expect(html).toContain(`<title>${projectName}</title>`);
		// node_modules must NOT exist (we passed --no-install)
		expect(existsSync(join(projectDir, "node_modules"))).toBe(false);
	});

	test("empty pre-existing directory: exits 0 without --force", async () => {
		const workspace = await freshDir("process-empty");
		const projectName = "empty-app";
		const projectDir = join(workspace, projectName);
		await mkdir(projectDir, { recursive: true });

		const proc = Bun.spawn(
			["bun", "run", scriptPath, "--no-install", projectName],
			{
				cwd: workspace,
				stdin: "ignore",
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);

		expect(exitCode).toBe(0);
		expect(stderr.length).toBe(0);
		expect(existsSync(join(projectDir, "package.json"))).toBe(true);
		expect(existsSync(join(projectDir, "index.html"))).toBe(true);
	});

	test("project path is a regular file: exits 1, no template files written", async () => {
		const workspace = await freshDir("process-not-dir");
		const projectName = "blocker-app";
		const blocker = join(workspace, projectName);
		await writeFile(blocker, "I am a file", "utf8");

		const proc = Bun.spawn(
			["bun", "run", scriptPath, "--no-install", projectName],
			{
				cwd: workspace,
				stdin: "ignore",
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);

		expect(exitCode).toBe(1);
		// Error mentions the directory
		expect(stderr).toContain(blocker);
		// The blocking file is untouched
		expect(await readFile(blocker, "utf8")).toBe("I am a file");
		// No template files
		expect(existsSync(join(workspace, "package.json"))).toBe(false);
		expect(existsSync(join(workspace, "index.html"))).toBe(false);
	});

	test("project path is a regular file with --force: still exits 1, file untouched", async () => {
		const workspace = await freshDir("process-not-dir-force");
		const projectName = "blocker-app";
		const blocker = join(workspace, projectName);
		await writeFile(blocker, "I am a file", "utf8");

		const proc = Bun.spawn(
			["bun", "run", scriptPath, "--no-install", "--force", projectName],
			{
				cwd: workspace,
				stdin: "ignore",
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);

		expect(exitCode).toBe(1);
		expect(stderr).toContain(blocker);
		expect(await readFile(blocker, "utf8")).toBe("I am a file");
	});
});

// ------------------------------------------------------------
// T2 — ttyConfirm helper (EOF/close + injected streams)
// ------------------------------------------------------------

describe("ttyConfirm", () => {
	const GUARD_MS = 1000;

	async function withGuard<T>(
		promise: Promise<T>,
	): Promise<T | "TIMEOUT"> {
		return Promise.race([
			promise,
			Bun.sleep(GUARD_MS).then(() => "TIMEOUT" as const),
		]);
	}

	test("EOF on input resolves false instead of hanging", async () => {
		const input = new PassThrough();
		input.end(); // EOF immediately, no data
		const output = new PassThrough();

		const result = await withGuard(ttyConfirm("prompt? ", input, output));

		expect(result).toBe(false);
	});

	test("'y' answer resolves true through injected streams", async () => {
		const input = new PassThrough();
		input.write("y\n");
		input.end();
		const output = new PassThrough();

		const result = await withGuard(ttyConfirm("prompt? ", input, output));

		expect(result).toBe(true);
	});

	test("'YeS' mixed-case answer resolves true (case-insensitive)", async () => {
		const input = new PassThrough();
		input.write("YeS\n");
		input.end();
		const output = new PassThrough();

		const result = await withGuard(ttyConfirm("prompt? ", input, output));

		expect(result).toBe(true);
	});

	test("'yes' lowercase answer resolves true", async () => {
		const input = new PassThrough();
		input.write("yes\n");
		input.end();
		const output = new PassThrough();

		const result = await withGuard(ttyConfirm("prompt? ", input, output));

		expect(result).toBe(true);
	});

	test("'Y' (uppercase) answer resolves true", async () => {
		const input = new PassThrough();
		input.write("Y\n");
		input.end();
		const output = new PassThrough();

		const result = await withGuard(ttyConfirm("prompt? ", input, output));

		expect(result).toBe(true);
	});

	test("'n' answer resolves false", async () => {
		const input = new PassThrough();
		input.write("n\n");
		input.end();
		const output = new PassThrough();

		const result = await withGuard(ttyConfirm("prompt? ", input, output));

		expect(result).toBe(false);
	});

	test("empty answer resolves false", async () => {
		const input = new PassThrough();
		input.write("\n");
		input.end();
		const output = new PassThrough();

		const result = await withGuard(ttyConfirm("prompt? ", input, output));

		expect(result).toBe(false);
	});

	test("garbage answer resolves false", async () => {
		const input = new PassThrough();
		input.write("maybe\n");
		input.end();
		const output = new PassThrough();

		const result = await withGuard(ttyConfirm("prompt? ", input, output));

		expect(result).toBe(false);
	});

	test("prompt text is written to the output stream", async () => {
		const input = new PassThrough();
		input.write("y\n");
		input.end();
		const output = new PassThrough();
		const chunks: Buffer[] = [];
		output.on("data", (chunk: Buffer | string) => {
			chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		});

		await withGuard(ttyConfirm("the-prompt ", input, output));

		const text = Buffer.concat(chunks).toString("utf8");
		expect(text).toContain("the-prompt");
	});
});

// ------------------------------------------------------------
// T3 — validateProjectName + cleanup of template placeholder
// ------------------------------------------------------------

describe("validateProjectName", () => {
	function expectRejection(
		name: string,
		fragment?: string,
	): void {
		try {
			validateProjectName(name);
		} catch (err) {
			expect(err).toBeInstanceOf(UsageError);
			const message = (err as Error).message;
			expect(message).toContain(name);
			if (fragment) {
				expect(message.toLowerCase()).toContain(fragment.toLowerCase());
			}
			return;
		}
		throw new Error(
			`Expected validateProjectName(${JSON.stringify(name)}) to throw`,
		);
	}

	describe("accepts well-formed names", () => {
		const accepted = ["my-app", "My_App", "app.v2", "a1", "my-app-2"];
		for (const name of accepted) {
			test(`accepts ${name}`, () => {
				expect(() => validateProjectName(name)).not.toThrow();
			});
		}
	});

	describe("rejects names failing the existing SAFE_NAME_RE", () => {
		test("rejects empty string", () => {
			expectRejection("", "my-axiom-app");
		});

		test("rejects '..' (parent directory)", () => {
			expectRejection("..");
		});

		test("rejects '.hidden' (starts with dot)", () => {
			expectRejection(".hidden");
		});

		test("rejects '-leading' (starts with dash)", () => {
			expectRejection("-leading");
		});

		test("rejects 'a/b' (slash)", () => {
			expectRejection("a/b");
		});

		test(`rejects 'a\\\\b' (backslash)`, () => {
			expectRejection("a\\b");
		});

		test("rejects '--help' (reachable through 'create-axiom -- --help')", () => {
			expectRejection("--help");
		});
	});

	describe("rejects Windows reserved device names", () => {
		const reserved = [
			"con",
			"CON",
			"prn",
			"aux",
			"nul",
			"com1",
			"com9",
			"lpt1",
			"lpt9",
			"con.txt",
			"nul.log",
			"COM1",
			"LPT9.doc",
		];
		for (const name of reserved) {
			test(`rejects reserved name ${JSON.stringify(name)}`, () => {
				expectRejection(name, "reserved");
			});
		}

		test("non-reserved names that look similar still pass", () => {
			expect(() => validateProjectName("console")).not.toThrow();
			expect(() => validateProjectName("commodity")).not.toThrow();
			expect(() => validateProjectName("connect")).not.toThrow();
		});
	});

	describe("rejects names ending in a dot or space", () => {
		test("rejects 'my-app.' (trailing dot)", () => {
			expectRejection("my-app.", "trailing");
		});

		test("rejects 'app.' (bare trailing dot)", () => {
			expectRejection("app.", "trailing");
		});

		test("rejects names with trailing space (caught by the existing regex)", () => {
			// SAFE_NAME_RE has no space in its character class, so the regex
			// rejects trailing-space names before the trailing-dot check runs.
			// The contract is still that the name is rejected and the message
			// names the offending value.
			try {
				validateProjectName("my-app ");
			} catch (err) {
				expect(err).toBeInstanceOf(UsageError);
				expect((err as Error).message).toContain("my-app ");
				return;
			}
			throw new Error("Expected validateProjectName('my-app ') to throw");
		});
	});

	describe("error messages are actionable", () => {
		test("every rejection message includes a valid example", () => {
			for (const name of ["con", "my-app.", "..", "-leading"]) {
				try {
					validateProjectName(name);
					throw new Error(`Expected to throw for ${name}`);
				} catch (err) {
					expect((err as Error).message).toContain("my-axiom-app");
				}
			}
		});

		test("error message does not include the 'Failed to create project:' prefix", () => {
			try {
				validateProjectName("con");
			} catch (err) {
				expect((err as Error).message).not.toContain("Failed to create project");
				return;
			}
			throw new Error("Expected to throw for con");
		});
	});
});

describe("create-axiom CLI — name validation + template cleanup", () => {
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

	test("--help still wins over an invalid project name (no error, no files written)", async () => {
		const workspace = await freshDir("help-wins");

		const result = await runCli(["--help", "con"], { cwd: workspace });

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Usage:");
		expect(result.stderr.length).toBe(0);
		const entries = await listEntries(workspace);
		expect(entries.length).toBe(0);
	});

	test("--version still wins over an invalid project name", async () => {
		const workspace = await freshDir("version-wins");
		const rootPkg = JSON.parse(
			await readFile(join(repoRoot, "package.json"), "utf8"),
		) as { version: string };

		const result = await runCli(["--version", "con"], { cwd: workspace });

		expect(result.exitCode).toBe(0);
		expect(result.stdout.trim()).toBe(rootPkg.version);
		const entries = await listEntries(workspace);
		expect(entries.length).toBe(0);
	});

	test("'-- --help' treats --help as the project name and rejects it", async () => {
		const workspace = await freshDir("dash-dash-help");
		const before = await listEntries(workspace);

		// The first `--` is consumed by `bun run` as the end of bun's options;
		// the script itself receives argv = ["--", "--help"], so parseArgs
		// turns `--help` into the project name and validateProjectName rejects
		// it as a regex failure (starts with `-`).
		const result = await runCli(["--", "--", "--help"], {
			cwd: workspace,
		});

		expect(result.exitCode).toBe(1);
		// No 'Failed to create project:' prefix — just the actionable message.
		expect(result.stderr).not.toContain("Failed to create project");
		expect(result.stderr).toContain("--help");
		const after = await listEntries(workspace);
		expect(after.length).toBe(before.length);
	});

	test("Windows reserved device name 'con' exits 1, writes nothing, mentions reason on stderr", async () => {
		const workspace = await freshDir("reserved-con");
		const before = await listEntries(workspace);

		const result = await runCli(["--no-install", "con"], { cwd: workspace });

		expect(result.exitCode).toBe(1);
		expect(result.stderr).not.toContain("Failed to create project");
		expect(result.stderr).toContain("con");
		// Reason must be visible
		expect(result.stderr.toLowerCase()).toContain("reserved");
		// A valid example is mentioned
		expect(result.stderr).toContain("my-axiom-app");

		const after = await listEntries(workspace);
		expect(after.length).toBe(before.length);
		expect(existsSync(join(workspace, "con"))).toBe(false);
	});

	test("trailing-dot name 'my-app.' exits 1 and writes nothing", async () => {
		const workspace = await freshDir("trailing-dot");
		const before = await listEntries(workspace);

		const result = await runCli(["--no-install", "my-app."], {
			cwd: workspace,
		});

		expect(result.exitCode).toBe(1);
		expect(result.stderr).not.toContain("Failed to create project");
		expect(result.stderr).toContain("my-app.");
		// Mentions the reason (trailing dot/space)
		expect(result.stderr.toLowerCase()).toMatch(/trailing|dot|space/);

		const after = await listEntries(workspace);
		expect(after.length).toBe(before.length);
		expect(existsSync(join(workspace, "my-app."))).toBe(false);
		expect(existsSync(join(workspace, "my-app"))).toBe(false);
	});

	test("a regex-invalid name exits 1 without 'Failed to create project:' prefix", async () => {
		const workspace = await freshDir("regex-invalid");
		const before = await listEntries(workspace);

		const result = await runCli(["--no-install", ".."], { cwd: workspace });

		expect(result.exitCode).toBe(1);
		expect(result.stderr).not.toContain("Failed to create project");
		expect(result.stderr).toContain("..");

		const after = await listEntries(workspace);
		expect(after.length).toBe(before.length);
	});

	test("valid name still exits 0 and scaffolds the project", async () => {
		const workspace = await freshDir("valid-name");
		const projectName = "happy-app";
		const projectDir = join(workspace, projectName);

		const result = await runCli(["--no-install", projectName], {
			cwd: workspace,
		});

		expect(result.exitCode).toBe(0);
		expect(existsSync(join(projectDir, "package.json"))).toBe(true);
		expect(existsSync(join(projectDir, "index.html"))).toBe(true);
		expect(existsSync(join(projectDir, "src", "app.ts"))).toBe(true);
		expect(existsSync(join(projectDir, "node_modules"))).toBe(false);
	});

	test("generated package.json pins axiom-framework to the root version after removing the placeholder", async () => {
		const workspace = await freshDir("pin-after-cleanup");
		const projectName = "pinned-app";
		const projectDir = join(workspace, projectName);

		const result = await runCli(["--no-install", projectName], {
			cwd: workspace,
		});

		expect(result.exitCode).toBe(0);
		expect(result.stderr.length).toBe(0);

		const rootPkg = JSON.parse(
			await readFile(join(repoRoot, "package.json"), "utf8"),
		) as { version: string };
		const generatedPkg = JSON.parse(
			await readFile(join(projectDir, "package.json"), "utf8"),
		) as { dependencies?: Record<string, string> };

		// The exact root version is pinned.
		expect(generatedPkg.dependencies?.["axiom-framework"]).toBe(rootPkg.version);

		// No leftover placeholder literal anywhere.
		expect(Object.values(generatedPkg.dependencies ?? {})).not.toContain(
			"__AXIOM_FRAMEWORK_VERSION__",
		);

		// The generated dependencies object contains exactly axiom-framework
		// (the template's `dependencies` block has no other entries after the
		// placeholder is removed).
		expect(Object.keys(generatedPkg.dependencies ?? {}).sort()).toEqual([
			"axiom-framework",
		]);
	});

	test("listEntries sees a workspace that holds only an empty directory", async () => {
		// F4 regression probe: the previous helper used Bun.Glob("**/*"),
		// which silently returns [] for a workspace whose only entry is an
		// empty directory like `.empty/` — so a test asserting "nothing was
		// written" could not catch a leaked empty directory. The helper now
		// uses readdir with withFileTypes so empty directories and hidden
		// entries are visible.
		const workspace = await freshDir("helper-blind-spot");
		await mkdir(join(workspace, ".empty"));
		const entries = await listEntries(workspace);
		expect(entries.length).toBe(1);
		expect(entries).toContain(".empty");
	});

	test("listEntries walks into a nested empty directory", async () => {
		// Regression probe: a top-level-only readdir cannot see `outer/.empty`
		// because it never descends into `outer/`. The helper must return
		// root-relative paths so an empty nested directory is visible.
		const workspace = await freshDir("helper-nested-empty");
		await mkdir(join(workspace, "outer", ".empty"), { recursive: true });
		const entries = await listEntries(workspace);
		expect(entries).toContain("outer");
		expect(entries).toContain("outer/.empty");
		expect(entries.length).toBe(2);
	});

	test("listEntries walks into a nested file", async () => {
		// Regression probe: a top-level-only readdir reports `outer` but
		// cannot see `outer/nested-file`. The helper must recurse so a file
		// inside a pre-existing directory appears as a root-relative path.
		const workspace = await freshDir("helper-nested-file");
		await mkdir(join(workspace, "outer"), { recursive: true });
		await writeFile(join(workspace, "outer", "nested-file"), "");
		const entries = await listEntries(workspace);
		expect(entries).toContain("outer");
		expect(entries).toContain("outer/nested-file");
		expect(entries.length).toBe(2);
	});

	test("listEntries distinguishes entries at different depths", async () => {
		// Regression probe: `readdir(..., { recursive: true })` in Bun
		// returns bare basenames, so `a/same` and `b/same` both come back as
		// `same` — both entries survive but their identity is lost, so a move
		// between directories becomes invisible. The helper must report
		// root-relative paths so a move between depths changes the inventory.
		const shallow = await freshDir("helper-depth-shallow");
		await mkdir(join(shallow, "outer"), { recursive: true });
		await writeFile(join(shallow, "outer", "nested-file"), "");
		const deep = await freshDir("helper-depth-deep");
		await mkdir(join(deep, "outer", "x"), { recursive: true });
		await writeFile(join(deep, "outer", "x", "nested-file"), "");

		const shallowEntries = await listEntries(shallow);
		const deepEntries = await listEntries(deep);

		expect(shallowEntries).toContain("outer/nested-file");
		expect(deepEntries).toContain("outer/x/nested-file");
		expect(shallowEntries).not.toEqual(deepEntries);
	});
});

// ------------------------------------------------------------
// F1 — install failure must exit 1, not print the Ready! block
// ------------------------------------------------------------
//
// Contract: when `bun install` fails inside the CLI, the CLI must exit 1
// and must NOT print the "Ready! Run: ... bun dev" block. The user must
// not be told to run a dev server when the install is broken.

describe("create-axiom CLI — install failure propagates as exit 1", () => {
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

	test("install failure exits 1 and skips the 'Ready! Run:' block", async () => {
		const workspace = await freshDir("install-fail");
		const projectName = "broken-install";
		const projectDir = join(workspace, projectName);

		// Pre-create the project directory with a bunfig.toml that points
		// `bun install` at a refused local port. With `--force` the CLI
		// proceeds without prompting on a non-TTY stdin, scaffolds the
		// project, then runs `bun install`, which fails fast with
		// ConnectionRefused (verified: ~40ms, exit 1, no retries).
		await mkdir(projectDir, { recursive: true });
		await writeFile(
			join(projectDir, "bunfig.toml"),
			'[install]\nregistry = "http://127.0.0.1:1"\ncache = false\n',
			"utf8",
		);

		const result = await runCli(["--force", projectName], {
			cwd: workspace,
		});

		// The CLI must exit non-zero on install failure.
		expect(result.exitCode).toBe(1);
		// stderr names the install failure (the actionable message).
		expect(result.stderr.toLowerCase()).toContain("install failed");
		// The "Ready!" block must NOT appear on stdout: telling the user
		// to run `bun dev` against an unbuilt project is misleading.
		expect(result.stdout).not.toContain("Ready!");
		expect(result.stdout).not.toContain("bun dev");
	});
});

// ------------------------------------------------------------
// F2 — generated build-static.ts must be personalised
// ------------------------------------------------------------
//
// Contract: `scaffoldProject` must substitute the {{PROJECT_NAME}}
// placeholder in every generated template that uses it. In particular
// the static build script must emit a site title and `<h1>` that use
// the project name, not the hardcoded "My Axiom Site" the template
// ships with.

async function listProjectFiles(cwd: string): Promise<string[]> {
	const entries = await Array.fromAsync(
		new Bun.Glob("**/*").scan({ cwd, dot: true }),
	);
	return entries.map((entry) => join(cwd, entry));
}

describe("create-axiom CLI — generated build-static.ts is personalised", () => {
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

	test("generated build-static.ts contains the project name and no placeholder", async () => {
		const workspace = await freshDir("build-static-personalised");
		const projectName = "cool-build";
		const projectDir = join(workspace, projectName);

		const result = await runCli(["--no-install", projectName], {
			cwd: workspace,
		});

		expect(result.exitCode).toBe(0);
		const buildStatic = await readFile(
			join(projectDir, "build-static.ts"),
			"utf8",
		);
		// The hardcoded template default is gone.
		expect(buildStatic).not.toContain("My Axiom Site");
		// The placeholder has been substituted.
		expect(buildStatic).not.toContain("{{PROJECT_NAME}}");
		// The project name appears in the generated script.
		expect(buildStatic).toContain(projectName);
	});

	test("no generated template file still contains the raw {{PROJECT_NAME}} placeholder", async () => {
		const workspace = await freshDir("no-raw-placeholder");
		const projectName = "clean-placeholders";
		const projectDir = join(workspace, projectName);

		const result = await runCli(["--no-install", projectName], {
			cwd: workspace,
		});

		expect(result.exitCode).toBe(0);

		const { stat } = await import("node:fs/promises");
		const files = await listProjectFiles(projectDir);
		for (const file of files) {
			const fileStat = await stat(file);
			if (!fileStat.isFile()) continue;
			const content = await readFile(file, "utf8");
			expect(content).not.toContain("{{PROJECT_NAME}}");
		}
	});

	test("generated build-static.ts runs end-to-end and emits a personalised dist/index.html", async () => {
		const workspace = await freshDir("e2e-build-static");
		const projectName = "shipped-site";
		const projectDir = join(workspace, projectName);

		const scaffoldResult = await runCli(["--no-install", projectName], {
			cwd: workspace,
		});
		expect(scaffoldResult.exitCode).toBe(0);

		// Provide the local framework fixture so the generated
		// `import { buildStatic, ... } from "axiom-framework"` resolves.
		await installLocalFrameworkFixture(projectDir);

		const buildProc = Bun.spawn(["bun", "run", "build-static.ts"], {
			cwd: projectDir,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});
		const [buildStdout, buildStderr, buildExitCode] = await Promise.all([
			new Response(buildProc.stdout).text(),
			new Response(buildProc.stderr).text(),
			buildProc.exited,
		]);

		expect(buildExitCode).toBe(0);
		expect(buildStderr.length).toBe(0);

		const distHtmlPath = join(projectDir, "dist", "index.html");
		const distHtml = await readFile(distHtmlPath, "utf8");
		// Personalised <title> and <h1> both use the project name.
		expect(distHtml).toContain(`<title>${projectName}</title>`);
		expect(distHtml).toMatch(/<h1[^>]*>[^<]*shipped-site/i);
		// The starter styles are inlined.
		expect(distHtml).toContain("<style>");
		expect(distHtml).toContain("button {");
	});
});
