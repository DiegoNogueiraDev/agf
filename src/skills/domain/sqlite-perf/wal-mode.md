---
domain: sqlite-perf
topic: wal-mode
triggers: [slow_writes, lock_contention, concurrent_readers]
discovered_at: 2026-04-28T00:00:00.000Z
source_task: seed
confidence: 0.85
---

# SQLite WAL Mode

Write-Ahead Logging lets readers and a single writer run concurrently without
blocking each other. Enable with `PRAGMA journal_mode = WAL;` once per database;
the setting persists in the file header.

## When to apply

- Writes are slow under read pressure.
- `SQLITE_BUSY` errors appear in logs.
- Multiple processes/threads need to read while one writes.

## Trade-offs

- A `-wal` and `-shm` sidecar file appear next to the database.
- Long-running readers can prevent the WAL from being checkpointed.
- Backups must include the WAL file or use `VACUUM INTO`.
