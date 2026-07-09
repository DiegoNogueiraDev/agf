---
name: graph-tests
description: Test strategy audit — Test Pyramid, FIRST principles, coverage analysis, and test quality. Run after IMPLEMENT, during VALIDATE, on declining coverage, or before releases.
triggers:
  - graph-tests
version: 1.0.0
author: Diego Nogueira
date: 2026-04-04
---

# graph-tests

Test strategy audit — Test Pyramid, FIRST, coverage, test quality. Finds coverage gaps, validates pyramid shape, enforces TDD. Drive via the `agf` CLI — zero MCP.

## When to Use

- After IMPLEMENT, before VALIDATE
- During VALIDATE quality checks
- Coverage insufficient or declining
- Before major releases
- Onboarding modules lacking coverage

## Mandatory Flow

```
npm test → coverage → pyramid → FIRST → missing tests → quality → edge cases → report → agf memory write
```

## Workflow

### Step 1: Suite Gate

```bash
npm test
```

All pass, zero failures. If any fail, STOP and fix — never audit on a broken suite.

### Step 2: Coverage

```bash
npm run test:coverage
```

Thresholds: statements 70%, branches 65%, functions 70%, lines 70%. Report files below; flag top 5 lowest as priority.

### Step 3: Pyramid

- Unit: `src/tests/*.test.ts` without DB/store deps
- Integration: `SqliteStore`, in-memory DB, cross-module
- E2E: `src/tests/e2e/*.test.ts` (Playwright)

Verify unit > integration > E2E. Flag inversions. Target ~70/20/10.

### Step 4: FIRST

- **Fast** — <1s each, no needless I/O/sleeps
- **Independent** — no shared mutable state, own store/state per test
- **Repeatable** — deterministic, no network/fs reliance
- **Self-validating** — clear assertions, no manual inspection
- **Timely** — written with/before implementation (TDD)

Score each 0–100; FIRST = average.

### Step 5: Missing Tests

For each modified `.ts` in `src/core/` and `src/mcp/`, check for a matching `.test.ts` in `src/tests/`. For graph-tracked tasks, run `agf check <id>` (includes TDD-adherence check). List public exported functions without test assertions.

### Step 6: Test Quality

AAA structure · minimal mocks (prefer in-memory SQLite, temp files) · factory helpers (`makeNode`/`makeEdge` from `src/tests/helpers/factories.ts`) · descriptive behavior names · clean `beforeEach`/`afterEach`, no leaked state · single-behavior focus.

### Step 7: Edge Cases

Per function: happy path · error paths (invalid/null/undefined/empty) · boundaries (0, -1, MAX_SAFE_INTEGER, empty/single arrays) · async errors (rejections, timeouts, concurrency) · type edge cases (missing optional, extra fields). Flag happy-path-only.

### Step 8: Report

**Grades:** A (90–100) all thresholds, correct pyramid, FIRST >80, no gaps · B (75–89) minor gaps, FIRST >65 · C (60–74) some below threshold / inverted · D (45–59) significant gaps, FIRST <50 · F (<45) critical test debt.

Save: `agf memory write "test-audit-<date>" --content <report>`

## Output Format

```
Phase: TEST AUDIT
Tests: <N> passed, <N> failed
Coverage: <N>% stmts, <N>% branches, <N>% fns, <N>% lines
Pyramid: unit:<N> integration:<N> e2e:<N>
FIRST: <N>/100
Gaps: <N> modules without tests
Grade: <A-F>
Recommendations: <top 3>
```

## Anti-Patterns

- Don't skip the full suite — a passing suite is the audit baseline
- Don't mock what you can run in-memory — prefer `:memory:` SQLite
- Don't write tests after implementation — TDD first
- Don't share mutable state between tests
- Don't ignore flaky tests — fix root cause, never retry-and-hope
- Don't test implementation details — test behavior/public contracts
- Don't skip edge cases for happy-path-only

## Codex Notes

- In Codex Plan Mode, plan only — do not mutate files.
- During implementation, follow `AGENTS.md` and use `apply_patch` for manual edits.
