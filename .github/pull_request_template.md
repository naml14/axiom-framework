## Summary

<!-- What does this PR do? One paragraph max. -->

## Type of change

- [ ] `fix` — bug fix (patch bump)
- [ ] `feat` — new feature (minor bump)
- [ ] `feat!` / `BREAKING CHANGE` — breaking change (major bump)
- [ ] `perf` — performance improvement (patch bump)
- [ ] `refactor` — no behavior change
- [ ] `test` — tests only
- [ ] `docs` — documentation only
- [ ] `ci` — workflow changes
- [ ] `chore` — maintenance

## Checklist

- [ ] Tests added or updated for the changed behavior
- [ ] `bun test` passes locally (all tests green)
- [ ] `bun run typecheck` passes locally
- [ ] This PR links at least one issue (`Closes #...`)
- [ ] `docs/V1-0-0-EVIDENCE-LOG.md` was updated (or marked N/A with reason)
- [ ] Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) format
- [ ] Hot path invariant respected: no DOM reads added to `src/render/reflow.ts`, `src/render/engines/fast-path.ts`, `src/render/engines/flex.ts`, or `src/render/commit.ts`
- [ ] No runtime dependencies added to `src/`

## Related issues

<!-- Closes #<issue number> -->

## Testing notes

<!-- Anything reviewers should know about how to test this? -->
