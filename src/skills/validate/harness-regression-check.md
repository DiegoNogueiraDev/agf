---
name: harness-regression-check
description: Compare harness scores before/after to gate merge
category: validate
phases: [VALIDATE, REVIEW]
---

# harness-regression-check

## When to use

In VALIDATE before promoting to REVIEW; in REVIEW before merging. Harness < 70 = elevated hallucination risk.

## Steps

1. Read baseline from last green commit: `agf insights dora`.
2. Run `agf harness` on current state.
3. If delta ≤ -5 pts: investigate which dimension regressed (type, test, naming, error handling, etc.).
4. If delta ≤ -10 pts: block merge. Open an investigation task before continuing.
5. Persist the new score so the next session sees it as baseline.

## Anti-patterns

- Treating harness as vanity metric — it predicts review effort.
- Boosting one dimension (e.g., adding empty JSDoc) to mask another regression.
- Ignoring the warning at `agf start` because "I'll clean up at the end".
