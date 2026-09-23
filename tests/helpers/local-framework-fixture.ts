import { cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve the repo root from this helper's own location. The helper lives
// at `tests/helpers/local-framework-fixture.ts`, so the repo root is two
// directories up — independent of where the test that imports it runs from.
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Install a local copy of the framework's `src/` into
 * `<projectDir>/node_modules/axiom-framework` so the generated scaffold's
 * `import ... from "axiom-framework"` resolves without a real publish step.
 *
 * The fixture writes `package.json` (name `axiom-framework`, version
 * `0.0.0-test`, type module, main/module `./src/index.ts`, exports `"."`
 * → `./src/index.ts`) and copies the repo's `src/` tree into
 * `node_modules/axiom-framework/src`.
 */
export async function installLocalFrameworkFixture(
	projectDir: string,
): Promise<void> {
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
