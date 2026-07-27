---
name: pure-decision-pattern
description: Extract pure logic from I/O so tests stay fast and deterministic
category: implement
phases: [IMPLEMENT]
---

# pure-decision-pattern

## When to use

Any module that decides something based on inputs (rate limit, threshold check, status mapping). Keep the decision pure; let the caller orchestrate I/O.

## Steps

1. Identify the decision: a function `(input) → output` with no side effects.
2. Move the decision to its own file under src/core/.../<name>.ts.
3. Test the decision with deterministic inputs only. No DB, no clock, no fs.
4. Caller (MCP tool / hook handler) injects clocks, DB connections, env reads.
5. For env-driven toggles, expose a tiny `isXDisabled(env)` helper that the caller checks.

## Anti-patterns

- Importing `process.env` deep in core (couples to node + makes test setup awful).
- Reading DB inside the decision — breaks the unit test boundary.
- Branching on `Date.now()` directly — inject a clock fn.
