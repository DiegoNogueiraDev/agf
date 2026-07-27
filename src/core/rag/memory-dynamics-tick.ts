/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Memory-dynamics tick — opportunistic auto-cadence.
 *
 * Closes the across-session "auto-learning" gap the user flagged: signals
 * (RAG citations, finish_task feedback, contradictions) flow continuously,
 * but the policy update — `decayStaleKnowledge` + `consolidateDuplicates` +
 * `forgetContradictions` — was gated on a manual `knowledge(action: reindex,
 * sources: ["quality"])` invocation. This module piggybacks the policy
 * update on `start_task` with a self-rate-limit so it runs at most once
 * every N minutes per project, regardless of how hot the session is.
 *
 * Why not a daemon: zero new infrastructure. mcp-graph is local-first.
 * Why start_task and not finish_task: start_task already does heavy work
 * (RAG assembly, sibling context); finish_task is the developer feedback
 * loop and we don't want extra latency there.
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import { decayStaleKnowledge, consolidateDuplicates, forgetContradictions } from './knowledge-quality.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'rag', source: 'memory-dynamics-tick.ts' })

export const MEMORY_DYNAMICS_TICK_KEY = 'last_memory_dynamics_tick_at'
export const MEMORY_DYNAMICS_TICK_INTERVAL_KEY = 'memory_dynamics_tick_interval_ms'
export const DEFAULT_TICK_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes

export interface DynamicsTickResult {
  ran: boolean
  reason: 'ran' | 'rate_limited'
  decayed?: number
  consolidated?: number
  forgotten?: number
  skippedHigherHelpful?: number
  lastTickAt?: string
}

export interface DynamicsTickOptions {
  /** Bypass the rate-limit check. */
  force?: boolean
  /** Override the project setting for this single call. */
  intervalMs?: number
}

function readIntervalMs(store: SqliteStore, override?: number): number {
  if (typeof override === 'number' && override >= 0) return override
  const raw = store.getProjectSetting(MEMORY_DYNAMICS_TICK_INTERVAL_KEY)
  if (!raw) return DEFAULT_TICK_INTERVAL_MS
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_TICK_INTERVAL_MS
}

/**
 * Maybe run the three memory-dynamics passes. Returns immediately with
 * `ran: false, reason: "rate_limited"` if the previous tick is still
 * within the interval window. Otherwise runs `decayStaleKnowledge`,
 * `consolidateDuplicates`, `forgetContradictions` and persists the new
 * timestamp.
 */
export function maybeRunMemoryDynamicsTick(store: SqliteStore, options?: DynamicsTickOptions): DynamicsTickResult {
  const intervalMs = readIntervalMs(store, options?.intervalMs)
  const lastTickAt = store.getProjectSetting(MEMORY_DYNAMICS_TICK_KEY)
  const now = Date.now()

  if (!options?.force && lastTickAt) {
    const lastMs = new Date(lastTickAt).getTime()
    if (Number.isFinite(lastMs) && now - lastMs < intervalMs) {
      return { ran: false, reason: 'rate_limited', lastTickAt }
    }
  }

  const db = store.getDb()
  const decay = decayStaleKnowledge(db)
  const consolidation = consolidateDuplicates(db)
  const forgetting = forgetContradictions(db)

  const newTickAt = new Date(now).toISOString()
  store.setProjectSetting(MEMORY_DYNAMICS_TICK_KEY, newTickAt)

  const result: DynamicsTickResult = {
    ran: true,
    reason: 'ran',
    decayed: decay.updated,
    consolidated: consolidation.consolidated,
    forgotten: forgetting.forgotten,
    skippedHigherHelpful: forgetting.skippedHigherHelpful,
    lastTickAt: newTickAt,
  }

  log.info('memory-dynamics-tick:ran', { ...result })
  return result
}
