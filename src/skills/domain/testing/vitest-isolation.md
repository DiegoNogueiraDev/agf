---
domain: testing
topic: vitest-isolation
triggers: [flaky_tests, shared_state, test_pollution]
discovered_at: 2026-04-28T00:00:00.000Z
source_task: seed
confidence: 0.8
---

# Vitest Test Isolation

Each test should create its own SqliteStore (`SqliteStore.open(":memory:")`)
and tear it down in `afterEach`. Module-level singletons leak state across
files when the worker pool reuses a process.

## When to apply

- Tests pass alone but fail when run together.
- Order-dependent failures.
- Mutable module-level caches (`Map`, `Set`) that aren't cleared.

## Pattern

```ts
let store: SqliteStore
beforeEach(() => {
  store = SqliteStore.open(':memory:')
})
afterEach(() => {
  store.close()
})
```

For singletons that can't be replaced, expose a `_reset()` test-only hook
and call it in `beforeEach` — never share a real DB file across tests.
