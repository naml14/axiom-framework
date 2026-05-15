import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { scaffoldProject } from "../scripts/create-axiom.ts";

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

async function linkStarterToLocalFramework(projectDir: string): Promise<void> {
	const nodeModulesDir = join(projectDir, "node_modules");
	await mkdir(nodeModulesDir, { recursive: true });
	await symlink(
		repoRoot,
		join(nodeModulesDir, "axiom-framework"),
		process.platform === "win32" ? "junction" : "dir",
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
	test("scaffoldProject writes a starter stylesheet and links it from index.html", async () => {
		const projectDir = await scaffoldStarterProject("scaffold");

		const indexHtml = await readFile(join(projectDir, "index.html"), "utf8");
		const starterStyles = await readFile(
			join(projectDir, "src", "styles.css"),
			"utf8",
		);

		expect(indexHtml).toMatch(
			/<link\s+rel="stylesheet"\s+href="\/src\/styles\.css"\s*\/?>/,
		);
		expect(indexHtml).toContain('src="/src/app.ts"');
		expect(starterStyles).toContain("h1,");
		expect(starterStyles).toContain("button {");
	});

	test("generated static build inlines the starter stylesheet into dist HTML", async () => {
		const projectDir = await scaffoldStarterProject("static-build");
		await linkStarterToLocalFramework(projectDir);

		const build = Bun.spawnSync(["bun", "run", "build-static.ts"], {
			cwd: projectDir,
			stdout: "pipe",
			stderr: "pipe",
		});

		if (build.exitCode !== 0) {
			const stdout = new TextDecoder().decode(build.stdout);
			const stderr = new TextDecoder().decode(build.stderr);
			throw new Error(
				`build-static.ts failed with exit code ${build.exitCode}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
			);
		}

		const distHtml = await readFile(join(projectDir, "dist", "index.html"), "utf8");
		expect(distHtml).toContain("<style>");
		expect(distHtml).toContain("button {");
		expect(distHtml).toContain("radial-gradient");
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
