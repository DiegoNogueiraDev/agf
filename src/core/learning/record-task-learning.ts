/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Feeds the learning store from the task lifecycle (called by `agf done`).
 *
 * Without this, `agf learning route/stats` had no data — the per-agent
 * performance tracker was dead. One `PerfRecord` per completed task turns it
 * into a live signal for routing decisions. Pure orchestration over the
 * existing {@link SqliteLearningStore.appendRecord}.
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import { SqliteLearningStore } from './sqlite-learning-store.js'

/** Inputs for a single task-completion learning record. */
export interface TaskLearningInput {
  /** Graph node id of the completed task. */
  nodeId: string
  /** Did the task pass its acceptance criteria / DoD? */
  acPassed: boolean
  /** Wall-clock cycle time in ms (0 when unknown). */
  cycleTimeMs?: number
  /** Harness score delta attributed to the task (0 when not measured). */
  harnessDelta?: number
  /** Routing identity (model tier / executor). Defaults to `local`. */
  agentId?: string
}

/**
 * Append one `PerfRecord` for a completed task. Synchronous and side-effect
 * only; callers should wrap in try/catch so telemetry never breaks `done`.
 */
export function recordTaskLearning(store: SqliteStore, input: TaskLearningInput): void {
  new SqliteLearningStore(store).appendRecord({
    agentId: input.agentId ?? 'local',
    nodeId: input.nodeId,
    harnessDelta: input.harnessDelta ?? 0,
    acPassed: input.acPassed,
    cycleTimeMs: input.cycleTimeMs ?? 0,
    ts: Date.now(),
  })
}
