# Tasks: DX Starter Kit — CLI, Cookbook y HMR

## Phase 1: CLI create-axiom

- [x] 1.1 Create `scripts/templates/` directory with scaffold files: package.json, tsconfig.json, src/app.ts, index.html
- [x] 1.2 Create `scripts/create-axiom.ts` — argument parsing, directory creation, template rendering
- [x] 1.3 Template package.json includes axiom-framework dep, jsxImportSource, scripts (dev, build, test)
- [x] 1.4 Template tsconfig.json configures jsx: react-jsx, jsxImportSource: axiom-framework
- [x] 1.5 Template src/app.ts — simple counter component demo with signal + JSX
- [x] 1.6 Add `create-axiom` script to package.json entry
- [ ] 1.7 Test: scaffold project → `bun install` → `bun test` passes

## Phase 2: HMR Watch Mode

- [x] 2.1 Add `--watch` flag to `demo/server.ts` via `fs.watch` on src/
- [x] 2.2 Debounce file changes (300ms) — avoid rapid re-trigger on save
- [x] 2.3 On change: dynamic re-import module, detect component._id change, call enableHotReloadRecovery()
- [x] 2.4 On shape change: full page reload (documented limitation)
- [x] 2.5 Add `demo:watch` script to package.json

## Phase 3: Cookbook

- [x] 3.1 Create `docs/COOKBOOK.md` with structure: recetas por nivel de complejidad
- [x] 3.2 Recipe 1: "Hello World con Signals" — signal, computed, effect
- [x] 3.3 Recipe 2: "Dashboard con Layout" — stack, row, grid, responsive
- [x] 3.4 Recipe 3: "Formularios con validación" — bind, validate, rules
- [x] 3.5 Recipe 4: "SSR básico" — renderToString + createApp hydrate
- [x] 3.6 Recipe 5: "Lista dinámica con For/Show" — control flow helpers
- [ ] 3.7 Verify each recipe is runnable code (smoke test imports)
