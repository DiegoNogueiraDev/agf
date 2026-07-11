---
domain: systems
topic: common-mistakes
triggers: [concurrency, distributed_systems, performance, deadlock, race_condition]
discovered_at: 2026-04-30T00:00:00.000Z
source_task: extracta-paper2code
confidence: 0.8
---

# Systems Implementation — Common Mistakes

Patterns where the code compiles but the _behavior_ is wrong under load.

## Concurrency

- **Mutex held across await** — JS/Python async: holding a lock while
  awaiting another I/O call serializes the whole pool. Release before
  awaiting; re-acquire after.
- **Read-modify-write without lock** — `count++` is three ops. Under
  concurrency you lose increments. Use atomic counters or a single
  `UPDATE ... SET col = col + 1`.
- **Double-check locking** — works in Java/C++ with proper memory
  fences; broken in many other languages because the second check sees
  a partially-constructed object.

## Distributed systems

- **At-most-once vs at-least-once** — clients usually need at-least-once
  with idempotency keys; servers usually offer at-least-once delivery.
  Treat duplicates as the default, not the edge case.
- **Clock skew** — never trust two machines' wall clocks to differ by
  less than 100 ms. Use logical clocks or relative times for ordering.
- **Network partitions are not "rare"** — every multi-AZ deploy will see
  one within a quarter. Design retries + backoff with jitter as
  always-on, not failure-mode.

## Performance

- **N+1 queries** — list view fetches N records then issues N follow-up
  queries. JOIN or use a batch loader (DataLoader pattern).
- **Wrong cache key granularity** — caching at request level invalidates
  too aggressively; per-user often invalidates not enough. The right
  granularity is the smallest stable subset of the data.
- **Synchronous I/O in event loop** — Node `fs.readFileSync` in a
  request handler blocks the whole process. Same for Python asyncio
  with sync DB drivers.

## Storage

- **Index on the wrong column order** — composite index on (user, ts)
  helps `WHERE user=? AND ts > ?`; doesn't help `WHERE ts > ?`. Order
  by selectivity-then-range.
- **WAL not checkpointed** — long-running readers in SQLite WAL mode
  prevent checkpoint, growing the `-wal` file unboundedly.
- **Migration without backfill** — adding a NOT NULL column on a large
  table without a default scans the whole table under a lock.

## When to escalate

If a task describes "scale to N users" or "handle bursts", the AC needs
explicit numbers (latency p95, throughput) and an answer to: what
happens when the bound is exceeded? Mark UNSPECIFIED otherwise.
