---
name: design-an-interface
description: Define a deep module's public surface before writing implementation
category: design
phases: [DESIGN, PLAN]
---

# design-an-interface

## When to use

Before implementing a module that other modules will depend on. Ousterhout: "modules should be deep" — small interface, large implementation.

## Steps

1. List the operations callers need. Cap at 5 named exports.
2. For each operation, write the type signature; add JSDoc with one example.
3. Sketch the impl without writing code: pseudocode in 3–6 bullets.
4. Run `agf harness` after first impl pass; depth ratio < 0.2 is good.
5. Write the test for the interface BEFORE the impl (TDD red).

## Anti-patterns

- Exporting internal helpers because "tests need them".
- Naming exports with implementation detail (`createSqliteFooStore` vs `createFooStore`).
- Passing more than 4 params unwrapped — bundle into options object.
