import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scaffoldProject } from "../scripts/create-axiom.ts";

const tempDirs: string[] = [];
const runningProcesses: Array<ReturnType<typeof Bun.spawn>> = [];

async function freshDir(label: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), `axiom-create-${label}-`));
	tempDirs.push(dir);
	return dir;
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
		const workspace = await freshDir("scaffold");
		const projectDir = join(workspace, "my-app");

		await scaffoldProject(projectDir, "my-app");

		const indexHtml = await readFile(join(projectDir, "index.html"), "utf8");
		const buildScript = await readFile(
			join(projectDir, "build-static.ts"),
			"utf8",
		);
		const starterStyles = await readFile(
			join(projectDir, "src", "styles.css"),
			"utf8",
		);

		expect(indexHtml).toMatch(
			/<link\s+rel="stylesheet"\s+href="\/src\/styles\.css"\s*\/?>/,
		);
		expect(indexHtml).toContain('src="/src/app.ts"');
		expect(buildScript).toContain('const starterStyles = await readFile');
		expect(buildScript).toContain('new URL("./src/styles.css", import.meta.url)');
		expect(buildScript).toContain("inlineStyles: starterStyles");
		expect(starterStyles).toContain("h1,");
		expect(starterStyles).toContain("button {");
	});

	test("generated dev server serves the starter stylesheet over HTTP", async () => {
		const workspace = await freshDir("dev-server");
		const projectDir = join(workspace, "my-app");

		await scaffoldProject(projectDir, "my-app");

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

	test("generated dev server does not expose non-public project files", async () => {
		const workspace = await freshDir("private-files");
		const projectDir = join(workspace, "my-app");

		await scaffoldProject(projectDir, "my-app");

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
