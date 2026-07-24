---
name: budget-aware-picking
description: Pick next task respecting cost budget — prefer XS/S when low
category: plan
phases: [PLAN, IMPLEMENT]
---

# budget-aware-picking

## When to use

When LLM cost is approaching the run cap or the sprint budget. Prevents tail-end blowups by biasing toward small tasks.

## Steps

1. Read current spend via `metrics(action='session_cost')`.
2. If totalUsd / capUsdPerRun > 0.8, filter ready tasks to xpSize XS/S.
3. Sort remaining: priority ASC, depth ASC, id stable tiebreak.
4. If no XS/S available, fall back to any size (still escalates approval).
5. Document the bias in `decisions.record` so the audit trail shows why.

## Anti-patterns

- Letting an L task run with 5% budget remaining — guaranteed mid-task abort.
- Hard-stopping at 80% without fallback — unfinished critical path.
- Re-picking the same task after cost-fallback engages without re-budgeting.
