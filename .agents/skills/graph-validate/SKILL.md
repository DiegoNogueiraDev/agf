---
name: graph-validate
description: Execute the VALIDATE phase of the lifecycle via the `agf` CLI — unified validation, done integrity, scenario coverage, DORA quality metrics
triggers:
  - graph-validate
version: 2.0.0
author: Diego Nogueira
date: 2026-04-04
toolchain:
  - agf check
  - agf insights
  - agf forecast
  - agf metrics
  - agf gate
  - agf phase
---

# graph-validate

Execute the VALIDATE phase of the lifecycle, driven entirely by the `agf` CLI (ZERO MCP). Runs comprehensive validation: E2E tests, acceptance criteria verification, integrity checks, and quality metrics via DORA.

## When to Use

- After IMPLEMENT phase has completed a sprint's worth of tasks
- Verifying that all acceptance criteria are met across multiple tasks
- Running E2E tests that span multiple components
- The current phase reported by `agf phase` is `VALIDATE`

## Mandatory Flow

```
agf check <id> (task) → agf check <id> (ac) → agf check <id> (done_integrity) → agf check <id> (status_flow) → agf insights (scenario_coverage) → agf forecast (dora) → agf metrics → agf gate validate → agf phase REVIEW
```

## Workflow

### Step 1: Identify Scope

List all tasks marked `done` in the current sprint:

```bash
agf kanban
```

Filter the board for the current sprint and the `done` column.

### Step 2: Task Validation (per task)

For each completed task, run the Definition of Done validation:

```bash
agf check <task_id>
```

Captured validation output feeds the lifecycle gates.

### Step 3: Validate Acceptance Criteria Quality

```bash
agf check <task_id>
```

Checks the node's AC: quality scoring (INVEST), measurability bonus.

### Step 4: Run Full Test Suite

```bash
npx vitest run
```

For E2E tests:

```bash
npx vitest run tests/integration/
```

Verify: all unit + integration tests pass, no regressions.

### Step 5: Verify Done Integrity

```bash
agf check <id>
```

Checks that all `done` nodes actually meet Definition of Done (9 checks).

### Step 6: Validate Status Flow

```bash
agf check <id>
```

Verifies all nodes followed valid status transitions (e.g., went through `in_progress` before `done`).

### Step 7: Check Scenario Coverage

```bash
agf insights
```

Validates that user scenarios have been covered by implemented tasks (scenario coverage).

### Step 8: DORA Quality Metrics

```bash
agf forecast
```

Review:

- **Change Failure Rate** — status reversals / total done (target: < 5%)
- **Lead Time** — P85 hours from created to done (target: < 24h)
- **MTTR** — mean time to recover from rework (target: < 1h)

### Step 9: Collect Sprint Metrics

```bash
agf metrics
```

Review: task completion rate, AC pass rate, avg completion time vs estimates.

### Step 10: Validate Gate

```bash
agf gate validate
```

**Gate criteria:**

- All sprint tasks validated
- AC pass rate meets threshold
- No critical test failures
- done_integrity and status_flow checks pass

If validation fails, return to IMPLEMENT to fix issues.

### Step 11: Transition

Once gate passes:

```bash
agf phase REVIEW
```

Follow the `nextAction` reported by `agf phase` for the recommended next CLI command.

## Output Format

```
Phase: VALIDATE → REVIEW
Tasks validated: N/M passed
Tests: N passed, M failed
AC pass rate: X%
DORA: change failure rate Y%, lead time P85 Zh
Gate: validate_ready — score N/100, grade X
Status: Ready to proceed to REVIEW phase
```

## Anti-Patterns

- Do NOT skip E2E tests — unit tests alone are insufficient
- Do NOT mark validation as passed if tests fail — fix first
- Do NOT ignore flaky tests — investigate and fix root cause
- Do NOT validate tasks still in_progress — complete first
- Do NOT ignore the `nextAction` reported by `agf phase` — it guides the optimal next command
- Do NOT skip `agf check` for done tasks — it catches DoD violations missed during IMPLEMENT
- Do NOT skip done_integrity check — it catches DoD violations missed during IMPLEMENT

## Codex Notes

- In Codex Plan Mode, use this skill for planning only and do not mutate files.
- During implementation, follow the project `AGENTS.md` rules and use `apply_patch` for manual edits.

## Token Economy

> **Economia de tokens.** Os levers compartilhados por todas as skills — `--select`,
> `agf retrieve-command`, `agf exec chain`, reuso antes de criação — vivem em
> [`_shared.md`](../_shared.md) → **Token Economy**. Fonte única: um parágrafo repetido
> em trinta arquivos é o trigésimo primeiro que envelhece sozinho.
