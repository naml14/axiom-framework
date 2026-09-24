import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, lstatSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import {
	parseArgs,
	resolveExistingDirectory,
	ttyConfirm,
	USAGE,
	UsageError,
} from "../scripts/create-axiom.ts";

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

	test("case 4: TTY + no answer (empty string) cancels", async () => {
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
		const [, stderr, exitCode] = await Promise.all([
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
		const [, stderr, exitCode] = await Promise.all([
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
		const [, stderr, exitCode] = await Promise.all([
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
		const [, stderr, exitCode] = await Promise.all([
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
		const [, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);

		expect(exitCode).toBe(1);
		expect(stderr).toContain(blocker);
		expect(await readFile(blocker, "utf8")).toBe("I am a file");
	});
});

	test("dangling symlink at project path: exits 1, no template files written", async () => {
		const workspace = await freshDir("process-dangling-symlink");
		const projectName = "phantom-link";
		const link = join(workspace, projectName);
		await symlink("D:/this/path/does/not/exist", link);

		const proc = Bun.spawn(
			["bun", "run", scriptPath, "--no-install", projectName],
			{
				cwd: workspace,
				stdin: "ignore",
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const [, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);

		expect(exitCode).toBe(1);
		// The CLI must surface "not a directory" — not an EEXIST stack trace.
		expect(stderr).toContain("exists but is not a directory");
		expect(stderr).toContain(link);
		// The symlink itself is untouched (no template files written through
		// it). existsSync() reports false for dangling symlinks on Windows,
		// so use lstatSync() to confirm the entry is still a symlink.
		expect(lstatSync(link).isSymbolicLink()).toBe(true);
		expect(existsSync(join(workspace, "package.json"))).toBe(false);
		expect(existsSync(join(workspace, "index.html"))).toBe(false);
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

	test("'yes' answer resolves true (case-insensitive)", async () => {
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
