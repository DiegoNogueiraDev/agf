/*!
 * releaseTaskClaim — releases a task's resource_locks lease on agf done/submit.
 * Task node_58663051cc10.
 *
 * WHY: Completing a task should free its claim immediately so other agents can
 * pick it up rather than waiting for TTL expiry. Pure helper; callers (done-cmd,
 * submit-cmd) wire the --agent flag.
 *
 * Composes with: lock-manager.ts (release by lease_token),
 *                done-cmd.ts / submit-cmd.ts (wiring point).
 */

import type Database from 'better-sqlite3'
import { LockManager } from '../store/lock-manager.js'

export interface ReleaseClaimResult {
  released: boolean
  mismatch: boolean
  agentId?: string
}

interface LockRow {
  lease_token: string
  agent_id: string
}

/** Release the resource lock for a task, if one exists and the agent matches. */
export function releaseTaskClaim(
  db: Database.Database,
  taskId: string,
  callerAgentId: string | undefined,
): ReleaseClaimResult {
  const row = db.prepare('SELECT lease_token, agent_id FROM resource_locks WHERE resource_id = ?').get(taskId) as
    LockRow | undefined

  if (!row) return { released: false, mismatch: false }

  if (callerAgentId && row.agent_id !== callerAgentId) {
    return { released: false, mismatch: true, agentId: row.agent_id }
  }

  const lm = new LockManager(db)
  lm.release(row.lease_token)
  return { released: true, mismatch: false, agentId: row.agent_id }
}
