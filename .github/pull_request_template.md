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
- [ ] Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) format
- [ ] Hot path invariant respected: no DOM reads added to `reflow.ts`, `fast-path.ts`, `flex.ts`, or `commit.ts`
- [ ] No runtime dependencies added to `src/`

## Related issues

<!-- Closes #<issue number> -->

## Testing notes

<!-- Anything reviewers should know about how to test this? -->
