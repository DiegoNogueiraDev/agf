---
name: graph-validate
description: VALIDATE phase — E2E tests, AC quality, done integrity, scenario coverage, DORA metrics
trigger: /graph-validate
tools_used: [check, insights, forecast, metrics, kanban]
tokens: ~550
---

<!-- shared:phases,gates,dod,principles,errors -->

# graph-validate

Comprehensive validation: E2E, acceptance criteria, integrity, DORA quality.

## When

- After IMPLEMENT — sprint of tasks done
- Verify AC across multiple tasks
- `_lifecycle.phase === VALIDATE`

## Flow

```
agf check <id> → agf insights → agf forecast → agf metrics → agf gate validate → agf phase
```

## Steps

### 1. Identify Scope

`agf kanban` — tasks per sprint, status done.

### 2. Browser Validation (UI tasks)

`agf check <id>` — E2E via Playwright; A/B with compareUrl + selector.

### 3. AC Quality

`agf check <id>` — INVEST score, measurability bonus. Score < 60 → `agf node update <id>` to rewrite AC.

### 4. Done Integrity

`agf check <id>` — done tasks truly passed DoD, have tests, no unresolved blockers.

### 5. Status Flow

`agf check <id>` — detect status skips (backlog→done without in_progress).

### 6. Scenario Coverage

`agf insights` — happy path, error path, edge cases covered by AC.

### 7. DORA Metrics

`agf forecast` — deploy frequency, lead time, change fail rate, MTTR.

### 8. Validate Ready Gate

`agf gate validate` — ≥50% tasks done with testable AC.

### 9. Spiral Feedback

`agf metrics --economy-report` → `agf learning` → calibrate sizing/routing for next cycle.

## Exit

- [ ] `agf check <id>` (ac) score ≥ 60 on all tasks
- [ ] done_integrity + status_flow pass
- [ ] E2E (Playwright) pass for UI tasks
- [ ] `agf gate validate` → `agf phase` (REVIEW)

Loop: gate pass → next: graph-review.

## Economy

Token economy is part of the loop: run `agf savings` / `agf metrics --economy-report` after each task, then feed savings → `agf learning` to calibrate the next turn (spiral, not circle).
