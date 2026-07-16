---
name: tracer-bullet-tdd
description: Red-Green-Refactor with one shot through every layer first
category: implement
phases: [IMPLEMENT]
---

# tracer-bullet-tdd

## When to use

Implementing a feature that touches multiple layers (e.g., MCP tool → core function → store). Get a thin slice end-to-end working before fattening any layer.

## Steps

1. Write the **smallest** test that exercises every layer (skinny e2e).
2. Stub each layer with the minimum code to make it red, then green.
3. Commit the tracer; the diff shows the architecture in one screen.
4. Now widen each layer: add cases to the unit tests of the layer that needs them.
5. Refactor only after green; never refactor red code.

## Anti-patterns

- Building one layer fully before the next exists ("vertical waterfall").
- Writing 10 tests up front then implementing — long red period kills feedback.
- Skipping refactor because tests pass — debt accumulates per layer.
