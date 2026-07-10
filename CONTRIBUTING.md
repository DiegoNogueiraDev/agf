# Contributing to agent-graph-flow

We want to make it easy for you to contribute. Here are the most common type
of changes that get merged:

- Bug fixes
- Performance improvements
- Documentation improvements
- New analyzer modes or quality gates
- Support for additional languages in tree-sitter

Any core architecture change or new lifecycle phase must go through a design
review before implementation.

## Developing

- Requirements: Node.js >= 20, npm >= 10
- Install dependencies and start:

  ```bash
  npm install
  npm run dev
  ```

### Commands

| Command              | Purpose                     |
| -------------------- | --------------------------- |
| `npm run dev`        | Start dev mode              |
| `npm run build`      | Build with tsup             |
| `npm test`           | Full test suite             |
| `npm run test:blast` | Changed-only tests (<60s)   |
| `npm run lint`       | ESLint with max 30 warnings |
| `npm run typecheck`  | TypeScript type check       |

## Pull Request Expectations

### Issue First Policy

**All PRs must reference an existing issue.** Before opening a PR, open an
issue describing the bug or feature. PRs without a linked issue may be closed
without review.

- Use `Fixes #123` or `Closes #123` in your PR description
- For small fixes, a brief issue is fine

### PR Requirements

- Keep pull requests small and focused
- Follow conventional commits: `type(scope): summary`
- Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `ci`
- Explain what changed and why
- Include test coverage for logic changes

### CI/CD Patterns

- **Actions pinned by SHA** — all GitHub Actions must use full commit SHA, never `@v1`/`@v2` tags
- **Changed-file detection** — CI uses `dorny/paths-filter` to skip irrelevant workflows
- **Gatherer job** — each workflow ends with a `gatherer` job that aggregates sub-job results
- **Fail fast** — CI fails on first error to avoid wasted resources

### Style Preferences

- **No `any`** — use precise TypeScript types
- **No `let`** — prefer immutable patterns
- **No `else`** — prefer early returns or ternaries
- **ESM only** — use `.js` extensions in relative imports
- **TDD** — write tests before implementation
- **Conventional commits** — enforced via commitlint

## Feature Requests

Open an issue describing the problem and your proposed approach. The core team
will help decide whether it should move forward.

## Issue Requirements

All issues **must** use one of our issue templates:

- **Bug report** — for reporting bugs
- **Feature request** — for suggesting enhancements

Blank issues are not allowed and will be automatically closed.
