---
name: plan-sprint
description: Build a sprint with capacity + WIP=1 + dependency-respecting order
category: plan
phases: [PLAN]
---

# plan-sprint

## When to use

End of ANALYZE/DESIGN, before IMPLEMENT. You have decomposed atomic tasks and need a sprint that fits the team capacity.

## Steps

1. Compute capacity: hours_available × focus_factor (0.65 default).
2. Sort tasks by `depends_on` (topological), then priority ASC.
3. Greedily pack until capacity exhausted; respect xpSize budget.
4. Run `agf gate design` and `agf code index` before unfreezing.
5. Verify WIP=1 enforceable: no two tasks share the same primary owner.

## Anti-patterns

- Filling capacity to 100% (kills cycle time per Little's Law).
- Ignoring blocked tasks until sprint starts — pre-resolve in PLAN.
- Sprint with mixed phases (analyze + implement) — split per phase.
