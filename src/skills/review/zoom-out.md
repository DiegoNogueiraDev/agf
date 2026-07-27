---
name: zoom-out
description: Step up one abstraction layer; produce a map of relevant modules and their callers when you don't know an area of code well
category: review
phases: [REVIEW, ANALYZE]
---

# zoom-out

Port of `skills-main/zoom-out`. Use when you (or a collaborator) hit code in an unfamiliar area and need orientation before changing it.

## When to use

- Reviewing a PR in a subsystem you've never touched
- About to refactor without a clear map of impact
- A bug report points into a module whose role you can't articulate

## Output shape

A short tree (≤ 1 page) covering:

1. **The module itself** — purpose in one sentence
2. **Direct callers** — who depends on this (use `agf code callers <symbol>` to find them)
3. **Direct dependencies** — what this depends on
4. **Sibling modules** — others playing the same role at the same layer
5. **Owning epic / requirement node** — pull from the graph if a node references this code path

Keep it factual. The point is a map, not commentary.

## Anti-patterns

- Diving into implementation details — that's "zoom IN"; this skill is the opposite
- Skipping the callers — without them you can't tell which behaviors are load-bearing
- Inventing structure to fit a pattern you saw elsewhere — describe what's actually there
