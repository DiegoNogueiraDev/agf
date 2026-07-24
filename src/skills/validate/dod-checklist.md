---
name: dod-checklist
description: Definition of Done — 9 checks before `agf node status <id> done`
category: validate
phases: [VALIDATE, IMPLEMENT]
---

# dod-checklist

## When to use

Before calling `agf done` or `agf node status <id> done`. The pipeline runs these automatically; this skill is the explicit human-readable form for review.

## Steps

1. has_acceptance_criteria — task or parent has AC. **Required.**
2. ac_quality_pass — score ≥ 60 (INVEST). **Required.**
3. no_unresolved_blockers — no `depends_on` to non-done. **Required.**
4. status_flow_valid — passed through `in_progress` before `done`. **Required.**
5. has_description — non-empty.
6. not_oversized — L/XL must have subtasks.
7. has_testable_ac — at least 1 AC has GIVEN/WHEN/THEN.
8. has_estimate — xpSize OR estimateMinutes set.
9. has_test_files — testFiles populated.

## Anti-patterns

- Marking done when test_gate is failing — violates DoD #4 spirit.
- Hand-editing AC after starting work to fit "what was done".
- Skipping ac_quality_pass with a "trivially fixed in next task" excuse.
