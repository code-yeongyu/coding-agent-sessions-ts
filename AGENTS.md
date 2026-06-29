# Repository Rules

## Development

- Use `pnpm`.
- Keep TypeScript strict: no `any`, no non-null assertions, no `@ts-ignore`, and no broad type assertions.
- Keep hand-written source and test files below 250 pure LOC.
- Run `pnpm check`, `pnpm e2e`, and `pnpm bench` before release or PR handoff.

## Pull Requests

- PRs must include the observable CLI evidence used for QA.
- CI must pass before merge.
- Prefer small, atomic commits with Conventional Commit subjects.
