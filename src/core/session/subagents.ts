/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Subagents registry projection — the HARNESS-level `subagents` surface from the
 * architecture diagram. Projects raw worker/agent records into validated
 * `Subagent` entries. Pure: callers pass the records they sourced.
 */

import type Database from 'better-sqlite3'
import { SubagentSchema, type Subagent, type SubagentStatus } from '../../schemas/session.schema.js'

/** Loosely-typed raw record (e.g. from worker-state or the swarm registry). */
export interface RawSubagentRecord {
  id: string
  role: Subagent['role']
  status: Subagent['status']
  model: string | null
}

/** Project raw records into validated subagents. Empty input → empty list. */
export function listSubagents(records: readonly RawSubagentRecord[] = []): Subagent[] {
  return records.map((r) => SubagentSchema.parse({ id: r.id, role: r.role, status: r.status, model: r.model }))
}

/** Map a free-form swarm status onto the Subagent status enum (fallback: active). */
const SWARM_STATUS_MAP: Readonly<Record<string, SubagentStatus>> = {
  pending: 'idle',
  idle: 'idle',
  claimed: 'active',
  active: 'active',
  running: 'active',
  done: 'done',
  completed: 'done',
  failed: 'failed',
  error: 'failed',
}

interface SwarmAgentRow {
  id: string
  role: string
  status: string
}

/**
 * Project the live `swarm_agents` registry into validated subagents. The swarm
 * table has no model column, so `model` is null. Empty when no swarm session.
 */
export function readSwarmSubagents(db: Database.Database): Subagent[] {
  const rows = db.prepare('SELECT id, role, status FROM swarm_agents ORDER BY created_at').all() as SwarmAgentRow[]
  return rows.map((r) =>
    SubagentSchema.parse({ id: r.id, role: r.role, status: SWARM_STATUS_MAP[r.status] ?? 'active', model: null }),
  )
}
