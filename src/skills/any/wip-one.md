---
name: wip-one
description: Single in-progress task per agent; finish before starting another
category: any
phases: [IMPLEMENT, VALIDATE]
---

# wip-one

## When to use

Always. Little's Law says cycle_time = WIP / throughput; lowering WIP lowers cycle time without sacrificing throughput.

## Steps

1. Before `agf start`, run `agf query --status in_progress`.
2. If a row returned: `agf done` or revert it before starting new work.
3. Long-running task blocked? Mark it `blocked` (not `in_progress`) with rationale.
4. Honor backpressure-detector (E22.C2) signals; pull, don't push.
5. Audit weekly: `metrics(action='wip_history')` should hover at 1.

## Anti-patterns

- Switching tasks because the current one is stuck — root cause first.
- Counting "background reading" as progress — it's not.
- Multiple in_progress with the same agent — invalid graph state.
