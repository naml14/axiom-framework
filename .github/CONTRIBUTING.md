# Contributing to axiom-framework

Thank you for your interest in contributing. This document explains the process and conventions to follow.

---

## Getting Started

```bash
git clone https://github.com/naml14/axiom-framework.git
cd axiom-framework
bun install

bun test           # run all tests (166+ passing)
bun run typecheck  # TypeScript type check
bun run build      # compile to dist/
bun run demo       # interactive demo in browser
```

---

## How to Contribute

1. **Open an issue first** — discuss the change before writing code. This avoids wasted effort and ensures alignment with the project philosophy.
2. **Fork** the repository and create a branch from `main`.
3. **Write tests** for any new behavior. The test suite must remain green.
4. **Follow the commit convention** (see below) — it drives automated versioning.
5. **Open a Pull Request** against `main` and fill in the template.

---

## Commit Message Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/) because **release-please** reads commit history to determine version bumps and generate the CHANGELOG automatically.

```
<type>(<scope>): <short description>

[optional body]

[optional footer — BREAKING CHANGE: ...]
```

### Types and their effect on versioning

| Type | When to use | Version bump |
|------|-------------|--------------|
| `feat` | New feature or capability | **minor** (0.x.0) |
| `fix` | Bug fix | **patch** (0.0.x) |
| `perf` | Performance improvement | **patch** |
| `refactor` | Code change without behavior change | no bump |
| `test` | Tests only | no bump |
| `docs` | Documentation only | no bump |
| `ci` | CI/workflow changes | no bump |
| `chore` | Maintenance (deps, config) | no bump |
| `feat!` or `BREAKING CHANGE:` | Breaking API change | **major** (x.0.0) |

### Examples

```
feat(signals): add batch() API for grouping multiple signal updates
fix(reflow): correct height calculation for empty flex containers
perf(fast-path): avoid array allocation in measureSimple for single children
docs(readme): add troubleshooting section for node16 module resolution
test(edge-cases): add test for deeply nested fragment flattening
chore(deps): update happy-dom to 21.0.0
feat!: rename createApp second argument from root to container

BREAKING CHANGE: The second argument to createApp() was renamed from `root`
to `container` to better reflect its purpose. Update all call sites:

  Before: createApp(App, root)
  After:  createApp(App, container)
```

### Scopes (optional but helpful)

`signals`, `prepare`, `reflow`, `commit`, `diff`, `scheduler`, `app`, `types`, `demo`, `ci`, `deps`

---

## Architecture Constraints

Before contributing code, understand the **core invariant**:

> **The hot path (reflow + commit) must never read from the DOM.**

Specifically, these are **forbidden** inside `reflow.ts`, `fast-path.ts`, `flex.ts`, and `commit.ts` after the initial setup:

```typescript
// ❌ NEVER in the hot path:
element.getBoundingClientRect()
element.offsetHeight
element.clientWidth
element.scrollHeight
canvas.measureText()
```

The only intentional DOM read is in `app.ts:getConstraints()`, which runs once per update cycle to read the container dimensions — before the arithmetic pipeline begins.

---

## Project Structure

```
src/
  signals.ts     — signal(), computed(), effect() — reactive core
  component.ts   — defineComponent() — component definition
  types.ts       — all shared types, zero imports
  prepare.ts     — tree analysis, metrics caching
  reflow.ts      — layout entry point, routes to fast/flex path
  fast-path.ts   — simple top-to-bottom block layout
  flex.ts        — full flex engine (row/col, gap, justify, align, padding)
  diff.ts        — fastDiff() and fullDiff() with key reconciliation
  commit.ts      — batched DOM writes (removes → updates → inserts)
  scheduler.ts   — rAF batching, injectable for testing
  app.ts         — createApp(), mount(), unmount(), getMetrics()
  index.ts       — public API surface

tests/           — bun:test suite (166+ tests)
demo/            — interactive browser demo
docs/            — internal design docs and architecture notes
```

---

## Running the Test Suite

```bash
bun test                        # all tests
bun test tests/signals.test.ts  # specific file
bun test --watch                # watch mode
```

Tests use **Bun's built-in test runner** and **Happy DOM** for DOM simulation. No browser required.

---

## Code Style

- **TypeScript strict mode** — no `any` without justification
- **No dependencies** in `src/` — the library has zero runtime dependencies
- **Imports use `.js` extension** in `.ts` files (ESM + `node16` resolution requirement)
- **Brand types** for opaque handles (`PreparedComponent`) — never expose internals
- **Float32Array** for layout buffers — preserves the zero-allocation guarantee in the hot path

---

## Questions?

Open a [Discussion](https://github.com/naml14/axiom-framework/discussions) for questions, ideas, or architecture feedback.
