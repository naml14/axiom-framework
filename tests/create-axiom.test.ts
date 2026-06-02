import { afterEach, describe, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { scaffoldProject, installProjectDependencies } from "../scripts/create-axiom.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const tempDirs: string[] = [];
const runningProcesses: Array<ReturnType<typeof Bun.spawn>> = [];

async function freshDir(label: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), `axiom-create-${label}-`));
	tempDirs.push(dir);
	return dir;
}

async function scaffoldStarterProject(label: string): Promise<string> {
	const workspace = await freshDir(label);
	const projectDir = join(workspace, "my-app");
	await scaffoldProject(projectDir, "my-app");
	return projectDir;
}

async function getAvailablePort(): Promise<number> {
	return await new Promise<number>((resolve, reject) => {
		const server = createServer();

		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (address === null || typeof address === "string") {
				server.close();
				reject(new Error("Failed to resolve an available port"));
				return;
			}

			server.close((closeError) => {
				if (closeError) {
					reject(closeError);
					return;
				}
				resolve(address.port);
			});
		});
	});
}

async function waitForServer(url: string): Promise<void> {
	for (let attempt = 0; attempt < 40; attempt++) {
		try {
			const response = await fetch(url);
			if (response.ok) return;
		} catch {
			// Server not ready yet.
		}

		await Bun.sleep(100);
	}

	throw new Error(`Timed out waiting for starter dev server: ${url}`);
}

async function startStarterDevServer(projectDir: string): Promise<number> {
	const port = await getAvailablePort();
	const proc = Bun.spawn(["bun", "run", "dev-server.ts"], {
		cwd: projectDir,
		env: {
			...process.env,
			PORT: String(port),
		},
		stdout: "ignore",
		stderr: "ignore",
	});
	runningProcesses.push(proc);

	await waitForServer(`http://127.0.0.1:${port}/`);
	return port;
}

async function installLocalFrameworkFixture(projectDir: string): Promise<void> {
	const packageDir = join(projectDir, "node_modules", "axiom-framework");
	await mkdir(packageDir, { recursive: true });
	await cp(join(repoRoot, "src"), join(packageDir, "src"), {
		recursive: true,
	});
	await writeFile(
		join(packageDir, "package.json"),
		`${JSON.stringify(
			{
				name: "axiom-framework",
				version: "0.0.0-test",
				type: "module",
				main: "./src/index.ts",
				module: "./src/index.ts",
				exports: {
					".": {
						import: "./src/index.ts",
					},
				},
			},
			null,
			2,
		)}\n`,
		"utf8",
	);
}

afterEach(async () => {
	for (const proc of runningProcesses.splice(0)) {
		proc.kill();
		await proc.exited.catch(() => {});
	}

	for (const dir of tempDirs.splice(0)) {
		await rm(dir, { recursive: true, force: true }).catch(() => {});
	}
});

describe("create-axiom starter", () => {
	test("scaffoldProject writes expected template files", async () => {
		const projectDir = await scaffoldStarterProject("templates-list");

		const expectedFiles = [
			"package.json",
			"tsconfig.json",
			"build-static.ts",
			"dev-server.ts",
			"src/app.ts",
			"src/styles.css",
			"index.html",
		];

		for (const file of expectedFiles) {
			const content = await readFile(join(projectDir, file), "utf8");
			expect(content.length).toBeGreaterThan(0);
		}
	});

	test("installProjectDependencies returns subprocess exit code", async () => {
		const projectDir = await freshDir("install-exit");
		await writeFile(
			join(projectDir, "package.json"),
			`${JSON.stringify({ name: "tmp-install", private: true }, null, 2)}\n`,
			"utf8",
		);

		const exitCode = installProjectDependencies(projectDir);
		expect(typeof exitCode).toBe("number");
		expect(exitCode).toBeGreaterThanOrEqual(0);
	});

	test("scaffoldProject writes a minimal starter app and links its stylesheet", async () => {
		const projectDir = await scaffoldStarterProject("scaffold");

		const indexHtml = await readFile(join(projectDir, "index.html"), "utf8");
		const starterApp = await readFile(
			join(projectDir, "src", "app.ts"),
			"utf8",
		);
		const generatedPackage = JSON.parse(
			await readFile(join(projectDir, "package.json"), "utf8"),
		) as { dependencies?: Record<string, string> };
		const rootPackage = JSON.parse(
			await readFile(join(repoRoot, "package.json"), "utf8"),
		) as { version: string };
		const starterStyles = await readFile(
			join(projectDir, "src", "styles.css"),
			"utf8",
		);

		// HTML wiring
		expect(indexHtml).toMatch(
			/<link\s+rel="stylesheet"\s+href="\/src\/styles\.css"\s*\/?>/,
		);
		expect(indexHtml).toContain('src="/src/app.ts"');

		// Title is personalized with the project name
		expect(indexHtml).toContain("<title>my-app</title>");
		expect(indexHtml).not.toContain("{{PROJECT_NAME}}");

		// No raw className — always class
		expect(starterApp).not.toContain("className");

		// New starter markers
		expect(starterApp).toContain("Edit src/app.ts to start building");
		expect(starterApp).toContain("defineComponent(() =>");
		expect(starterApp).toContain("count.value");
		expect(starterApp).toContain("doubled");
		expect(starterApp).toContain("items");
		expect(starterApp).toContain("Next steps");

		// Engine-native layout: spacing/sizing live in layout props, not CSS
		expect(starterApp).toContain("layout: { height:");

		// No landing-page sections
		expect(starterApp).not.toContain("The DOM is just");
		expect(starterApp).not.toContain("Architecture principles");
		expect(starterApp).not.toContain("dual-licensed");
		expect(starterApp).not.toContain("Up and running in seconds");
		expect(starterApp).not.toContain("A framework that respects the platform");

		expect(generatedPackage.dependencies?.["axiom-framework"]).toBe(
			rootPackage.version,
		);

		// CSS: base styles must be present
		expect(starterStyles).toContain("button {");
		expect(starterStyles).toContain("radial-gradient");

		// CSS: new starter classes must exist
		expect(starterStyles).toContain(".title {");
		expect(starterStyles).toContain(".eyebrow {");
		expect(starterStyles).toContain(".hint {");

		// CSS: old landing-only classes must be gone
		expect(starterStyles).not.toContain(".hero {");
		expect(starterStyles).not.toContain(".principles-grid {");
		expect(starterStyles).not.toContain(".demo-snippet {");
		expect(starterStyles).not.toContain(".pipeline-section {");
		expect(starterStyles).not.toContain(".api-section {");
		expect(starterStyles).not.toContain(".cta-section {");
	});

	test("scaffoldProject personalizes the HTML title with the given project name", async () => {
		const workspace = await freshDir("title");
		const projectDir = join(workspace, "cool-project");
		await scaffoldProject(projectDir, "cool-project");

		const indexHtml = await readFile(join(projectDir, "index.html"), "utf8");

		expect(indexHtml).toContain("<title>cool-project</title>");
		expect(indexHtml).not.toContain("{{PROJECT_NAME}}");
		expect(indexHtml).not.toContain("my-app");
	});

	test("scaffoldProject personalizes the visible heading in app.ts with the project name", async () => {
		const workspace = await freshDir("heading");
		const projectDir = join(workspace, "cool-project");
		await scaffoldProject(projectDir, "cool-project");

		const starterApp = await readFile(join(projectDir, "src", "app.ts"), "utf8");

		// Visible h1 heading must use the project name, not the hardcoded default
		expect(starterApp).toContain("'cool-project'");
		expect(starterApp).not.toContain("'my-app'");
		expect(starterApp).not.toContain("{{PROJECT_NAME}}");
	});

	test("scaffoldProject keeps visible heading when project name is the default my-app", async () => {
		const projectDir = await scaffoldStarterProject("heading-default");

		const starterApp = await readFile(join(projectDir, "src", "app.ts"), "utf8");

		// When the project is named my-app, the heading should read my-app
		expect(starterApp).toContain("'my-app'");
		expect(starterApp).not.toContain("{{PROJECT_NAME}}");
	});

	test("generated static build inlines the starter stylesheet into dist HTML", async () => {
		const projectDir = await scaffoldStarterProject("static-build");
		await installLocalFrameworkFixture(projectDir);

		const build = Bun.spawnSync(["bun", "run", "build-static.ts"], {
			cwd: projectDir,
			stdout: "pipe",
			stderr: "pipe",
		});

		// Use stdout "Built" as success indicator — exitCode may be null on some runners
		// even when the build actually succeeded.
		const stdout = new TextDecoder().decode(build.stdout ?? new Uint8Array());
		if (!stdout.includes("Built")) {
			const stderr = new TextDecoder().decode(build.stderr ?? new Uint8Array());
			throw new Error(
				`build-static.ts did not produce dist/index.html (exit code ${build.exitCode})\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
			);
		}
		const distHtmlPath = join(projectDir, "dist", "index.html");
		const distHtml = await readFile(distHtmlPath, "utf8");
		expect(distHtml).toContain("<style>");
		expect(distHtml).toContain("button {");
		expect(distHtml).toContain("radial-gradient");
	});

	test("generated dev server serves root HTML with security headers", async () => {
		const projectDir = await scaffoldStarterProject("root-security-headers");
		const port = await startStarterDevServer(projectDir);

		const htmlResponse = await fetch(`http://127.0.0.1:${port}/`);
		expect(htmlResponse.status).toBe(200);
		expect(htmlResponse.headers.get("x-content-type-options")).toBe("nosniff");
		expect(htmlResponse.headers.get("x-frame-options")).toBe("SAMEORIGIN");
	});

	test("generated dev server serves the starter stylesheet over HTTP", async () => {
		const projectDir = await scaffoldStarterProject("dev-server");
		const port = await startStarterDevServer(projectDir);

		const htmlResponse = await fetch(`http://127.0.0.1:${port}/`);
		expect(htmlResponse.status).toBe(200);
		expect(await htmlResponse.text()).toContain("/src/styles.css");

		const cssResponse = await fetch(`http://127.0.0.1:${port}/src/styles.css`);
		expect(cssResponse.status).toBe(200);
		expect(cssResponse.headers.get("content-type")).toContain("text/css");

		const css = await cssResponse.text();
		expect(css).toContain("button {");
		expect(css).toContain("radial-gradient");
	});

	test("generated dev server returns 404 for malformed encoded asset paths", async () => {
		const projectDir = await scaffoldStarterProject("malformed-path");
		const port = await startStarterDevServer(projectDir);

		const malformedResponse = await fetch(
			`http://127.0.0.1:${port}/src/%ZZ.css`,
		);
		expect(malformedResponse.status).toBe(404);
	});

	test("generated dev server does not expose non-public project files", async () => {
		const projectDir = await scaffoldStarterProject("private-files");
		const port = await startStarterDevServer(projectDir);

		const packageResponse = await fetch(
			`http://127.0.0.1:${port}/package.json`,
		);
		expect(packageResponse.status).toBe(404);

		const devServerResponse = await fetch(
			`http://127.0.0.1:${port}/dev-server.ts`,
		);
		expect(devServerResponse.status).toBe(404);

		const tsConfigResponse = await fetch(
			`http://127.0.0.1:${port}/tsconfig.json`,
		);
		expect(tsConfigResponse.status).toBe(404);
	});
});
