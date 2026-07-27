---
name: decompose-prd
description: Break a PRD into atomic XS/S subtasks with acceptance criteria
category: analyze
phases: [ANALYZE, PLAN]
---

# decompose-prd

## When to use

Right after `agf import-prd`, before any sprint planning. The PRD ships as a few large epics; you need every leaf to be ≤ 2h and have testable AC.

## Steps

1. Read the imported epic via `node` action='get'.
2. For each undocumented requirement, create child subtasks with xpSize XS or S. Title format: `Eα.Tβ — <verb>-<object> (S)`.
3. Each AC must be GIVEN/WHEN/THEN testable; minimum 5 AC per task.
4. Link `depends_on` edges only when serial execution is mandatory.
5. Run `agf gate analyze` to confirm DoR (≥ 7 checks pass).

## Anti-patterns

- "TBD" in AC fields — every AC measurable up front.
- M/L tasks left undecomposed — split into XS+XS+S before sprint planning.
- Phantom subtasks (no AC, no testFiles) inflating sprint capacity.
