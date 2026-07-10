/*!
 * sweepStaleLeases — removes expired resource_locks rows.
 * Task node_2b33740765ab.
 *
 * WHY: Claims with expiresAt in the past should be cleaned so those resources
 * become pullable again without waiting for the TTL. Called by `agf swarm sweep`
 * and by `agf next` implicitly via LockManager.acquire. This helper makes the
 * sweep explicit, testable, and reportable (returns swept count).
 *
 * Composes with: lock-manager.ts (acquire already cleans on conflict),
 *                swarm-cmd.ts (`agf swarm sweep` subcommand).
 */

import type Database from 'better-sqlite3'

/** Delete all resource_locks rows whose expires_at is in the past. Returns swept count. */
export function sweepStaleLeases(db: Database.Database): number {
  // Table may not exist on older DBs or in-memory test stores without migrations.
  const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='resource_locks'").get()
  if (!exists) return 0
  const now = new Date().toISOString()
  const result = db.prepare('DELETE FROM resource_locks WHERE expires_at < ?').run(now)
  return result.changes
}
