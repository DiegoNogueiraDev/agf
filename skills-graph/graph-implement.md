---
name: graph-implement
description: IMPLEMENT phase — TDD Red-Green-Refactor, task pipeline, 9 DoD checks, epic promotion
trigger: /graph-implement
tools_used: [start, done, node status, check, context, brief, submit]
tokens: ~600
---

<!-- shared:phases,gates,dod,pipeline,principles,errors -->

# graph-implement

Core coding phase. TDD mandatory. Every line traced via `agf`.

## When

- After PLAN (tasks decomposed, sprints planned)
- `_lifecycle.phase === IMPLEMENT`
- User says "next task", "implement", "start coding"

## Flow

```
agf start → [TDD Red→Green→Refactor] → agf done <id>
```

## Steps

### 1. Start Task

`agf start` = `agf next` + `agf context <id>` + `agf node status <id> in_progress`. Returns task + context + ragContext + tddHints. Blocked → resolve blockers or skip.

### 2. Pre-Checks

`agf check <id>` (TDD adherence) · `agf insights` (stale refs / code sync).

### 3. TDD Red-Green-Refactor

- **RED:** failing test from AC + tddHints
- **GREEN:** minimal impl to pass
- **REFACTOR:** clean up, tests stay green, no regressions

### 4. Finish Task

Run `npm run test:blast` first. Then `agf done <id>` — 9 DoD checks → AC validation → `agf node status <id> done` → epic promotion check.

### 5. Delegated Mode (optional)

`agf brief <id>` → executor implements → `agf submit <id> --result <json>` (brief→submit loop closes in one step on valid return).

### 6. Spiral Feedback

After done: `agf savings` / `agf metrics --economy-report` → `agf learning` → calibrate next task.

## Exit

- [ ] 9 DoD checks pass (Grade A target)
- [ ] `npm run test:blast` passed
- [ ] testFiles populated on node
- [ ] Epic promotion checked (if all children done)

Close: `agf submit <id>` (delegated) or `agf check <id>` → `agf done <id>` → next: graph-validate.
