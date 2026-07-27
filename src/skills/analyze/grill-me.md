---
name: grill-me
description: Stress-test a decision by surfacing assumptions and counter-arguments
category: analyze
phases: [ANALYZE, DESIGN, REVIEW]
---

# grill-me

## When to use

Before locking a non-trivial design decision (ADR-worthy). Use to surface implicit assumptions and find the strongest counter-argument before committing.

## Steps

1. State the proposed decision in one sentence.
2. List 3 assumptions the decision rests on. Tag each: load-bearing / convenient / wishful.
3. For each assumption, ask "what changes if it's wrong?".
4. Generate the strongest possible counter-position (steel-man, not straw-man).
5. Document residual risk in the ADR `## Consequences` section.

## Anti-patterns

- Skipping load-bearing assumptions because "obviously true".
- Self-grilling without changing the decision — performative.
- Stopping at the weakest counter ("but that's silly").
