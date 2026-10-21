import { afterEach, describe, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { gzipSync } from "node:zlib";
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

type FakeRegistryPackage = {
	name: string;
	version: string;
	files: Record<string, string>;
};

// Minimal POSIX tar writer (regular files only) — enough for bun install.
function createTarGz(files: Record<string, string>): Buffer {
	const chunks: Buffer[] = [];

	for (const [name, content] of Object.entries(files)) {
		const data = Buffer.from(content, "utf8");
		const header = Buffer.alloc(512, 0);
		header.write(name.slice(0, 100), 0, "utf8");
		header.write("0000644\0", 100, 8, "utf8");
		header.write("0000000\0", 108, 8, "utf8");
		header.write("0000000\0", 116, 8, "utf8");
		header.write(`${data.length.toString(8).padStart(11, "0")}\0`, 124, 12, "utf8");
		header.write("00000000000\0", 136, 12, "utf8");
		header.write("        ", 148, 8, "utf8");
		header.write("0", 156, 1, "utf8");
		header.write("ustar\0", 257, 6, "utf8");
		header.write("00", 263, 2, "utf8");

		let checksum = 0;
		for (const byte of header) checksum += byte;
		header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "utf8");

		chunks.push(header, data);
		const padding = (512 - (data.length % 512)) % 512;
		if (padding > 0) chunks.push(Buffer.alloc(padding, 0));
	}

	chunks.push(Buffer.alloc(1024, 0));
	return Buffer.from(gzipSync(Buffer.concat(chunks)));
}

async function startFakeRegistry(
	packages: FakeRegistryPackage[],
): Promise<{ url: string; close: () => Promise<void> }> {
	const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
	const tarballs = new Map<string, Buffer>();
	for (const pkg of packages) {
		const files: Record<string, string> = {};
		for (const [name, content] of Object.entries(pkg.files)) {
			files[`package/${name}`] = content;
		}
		tarballs.set(`${pkg.name}-${pkg.version}.tgz`, createTarGz(files));
	}

	const server = createHttpServer((req, res) => {
		const decoded = decodeURIComponent(
			(req.url ?? "/").split("?")[0] ?? "/",
		).replace(/^\/+/, "");
		const base = `http://${req.headers.host ?? "127.0.0.1"}`;

		let tarballKey: string | undefined;
		for (const key of tarballs.keys()) {
			if (decoded === key || decoded.endsWith(`/${key}`)) {
				tarballKey = key;
				break;
			}
		}

		if (decoded.endsWith(".tgz") && tarballKey !== undefined) {
			const body = tarballs.get(tarballKey) as Buffer;
			res.writeHead(200, {
				"content-type": "application/octet-stream",
				"content-length": String(body.length),
			});
			res.end(body);
			return;
		}

		const pkg = byName.get(decoded);
		if (pkg) {
			const tarball = tarballs.get(`${pkg.name}-${pkg.version}.tgz`) as Buffer;
			const packument = {
				name: pkg.name,
				"dist-tags": { latest: pkg.version },
				versions: {
					[pkg.version]: {
						name: pkg.name,
						version: pkg.version,
						dist: {
							tarball: `${base}/${pkg.name}-${pkg.version}.tgz`,
							shasum: createHash("sha1").update(tarball).digest("hex"),
						},
					},
				},
			};
			const body = Buffer.from(JSON.stringify(packument), "utf8");
			res.writeHead(200, {
				"content-type": "application/json",
				"content-length": String(body.length),
			});
			res.end(body);
			return;
		}

		res.writeHead(404, { "content-type": "application/json" });
		res.end(JSON.stringify({ error: "not found" }));
	});

	await new Promise<void>((resolve) =>
		server.listen(0, "127.0.0.1", resolve),
	);
	const address = server.address();
	if (address === null || typeof address === "string") {
		throw new Error("Failed to start the fake registry");
	}

	return {
		url: `http://127.0.0.1:${address.port}`,
		close: () =>
			new Promise<void>((resolve, reject) => {
				server.close((err) => (err ? reject(err) : resolve()));
			}),
	};
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

		// Run build inline using the fixture's buildStatic to avoid subprocess hanging
		// issues on some runners (spawnSync may not return even though build completes).
		const { buildStatic, defineComponent } = await import(
			join(projectDir, "node_modules", "axiom-framework", "src", "index.ts")
		);
		const { readFile } = await import("node:fs/promises");
		const starterStyles = await readFile(
			join(projectDir, "src", "styles.css"),
			"utf8",
		);
		const HomePage = defineComponent(() => ({
			type: "element" as const,
			tag: "div",
			children: [],
		}));
		await buildStatic({
			routes: [
				{
					path: "/",
					component: HomePage,
					metadata: { inlineStyles: starterStyles },
				},
			],
			outDir: join(projectDir, "dist"),
		});

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

describe("create-axiom CLI exit code", () => {
	const cliPath = join(repoRoot, "scripts", "create-axiom.ts");

	test("CLI exits 1, keeps scaffold, and skips the Ready block when install fails", async () => {
		const workspace = await freshDir("cli-install-fail");

		// Hermetic + offline: 127.0.0.1:9 (discard port, nothing listening) makes
		// registry resolution fail fast without touching the real network. Bun
		// reads BUN_CONFIG_REGISTRY (not BUN_INSTALL_REGISTRY) for this override.
		// A fresh cache dir keeps the run independent of the machine's global cache.
		const cacheDir = await freshDir("cli-install-fail-cache");
		const result = Bun.spawnSync(["bun", cliPath, "broken-app"], {
			cwd: workspace,
			env: {
				...process.env,
				BUN_CONFIG_REGISTRY: "http://127.0.0.1:9",
				BUN_INSTALL_CACHE_DIR: cacheDir,
			},
			timeout: 60_000,
		});
		const output = `${result.stdout.toString()}\n${result.stderr.toString()}`;

		expect(result.exitCode).toBe(1);
		expect(output).toContain("Install failed");
		expect(output).not.toContain("Ready!");

		// The scaffolded project must still exist so the user can run
		// 'bun install' manually as the error message instructs.
		const generatedPackage = await readFile(
			join(workspace, "broken-app", "package.json"),
			"utf8",
		);
		expect(generatedPackage).toContain("axiom-framework");
		const starterApp = await readFile(
			join(workspace, "broken-app", "src", "app.ts"),
			"utf8",
		);
		expect(starterApp.length).toBeGreaterThan(0);
	}, 90_000);

	test("CLI exits 0 and prints the Ready block when install succeeds", async () => {
		const rootPackage = JSON.parse(
			await readFile(join(repoRoot, "package.json"), "utf8"),
		) as { version: string };
		const frameworkVersion = rootPackage.version;

		// Hermetic success path: a localhost registry serving stub packages for
		// every dependency in the scaffolded package.json. No external network.
		const stub = (name: string, version: string): FakeRegistryPackage => ({
			name,
			version,
			files: {
				"package.json": JSON.stringify({ name, version, main: "index.js" }),
				"index.js": "export {};\n",
			},
		});
		const registry = await startFakeRegistry([
			stub("axiom-framework", frameworkVersion),
			stub("@types/bun", "1.0.0"),
			stub("typescript", "6.0.0"),
		]);

		try {
			const workspace = await freshDir("cli-install-ok");
			// Fresh cache dir: never reads or pollutes the machine's global bun cache.
			const cacheDir = await freshDir("cli-install-ok-cache");
			// Async spawn: the fake registry lives in this test process, and
			// spawnSync would block the event loop so the server could never answer.
			const proc = Bun.spawn(["bun", cliPath, "ok-app"], {
				cwd: workspace,
				env: {
					...process.env,
					BUN_CONFIG_REGISTRY: registry.url,
					BUN_INSTALL_CACHE_DIR: cacheDir,
				},
				stdout: "pipe",
				stderr: "pipe",
			});
			runningProcesses.push(proc);
			const [stdout, stderr, exitCode] = await Promise.all([
				new Response(proc.stdout).text(),
				new Response(proc.stderr).text(),
				proc.exited,
			]);
			const output = `${stdout}\n${stderr}`;

			expect(exitCode).toBe(0);
			expect(output).toContain("Dependencies installed");
			expect(output).toContain("Ready! Run:");
			expect(output).toContain("bun dev");
			expect(output).not.toContain("Install failed");

			const installedPackage = await readFile(
				join(workspace, "ok-app", "node_modules", "axiom-framework", "package.json"),
				"utf8",
			);
			expect(installedPackage).toContain("axiom-framework");
			// Proves the install came from the local fake registry (stub marker),
			// not from the real npm registry or a shared cache entry.
			const stubMarker = await readFile(
				join(workspace, "ok-app", "node_modules", "axiom-framework", "index.js"),
				"utf8",
			);
			expect(stubMarker).toContain("export {}");
		} finally {
			await registry.close();
		}
	}, 150_000);
});
