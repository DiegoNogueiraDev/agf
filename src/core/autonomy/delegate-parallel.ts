/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §S1.3 — Parallel delegate mode. Estende o delegateSubtasks sequencial com
 * mode:'parallel' que spawna N agentes simultaneamente via Promise.allSettled.
 */

import type { AbortLike } from './autopilot-loop.js'
import type { BudgetGuard } from './budget-guard.js'
import type { SharedFindings } from './shared-findings.js'
import { Semaphore } from '../utils/semaphore.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'delegate-parallel' })

export interface SubagentOutcome {
  success: boolean
  tokensUsed: number
  summary?: string
  /**
   * Tokens charged against an optional {@link BudgetGuard}. Falls back to
   * `tokensUsed` when omitted, and to 0 if neither is present.
   */
  tokens?: number
}

export interface SubagentResult extends SubagentOutcome {
  id: string
  title: string
  /** True when the subtask was not run because its graph node was already
   * claimed by a peer worker (see {@link ClaimPort}). A skip is neither a
   * completion nor a failure. */
  skipped?: boolean
  /** True when a sibling already recorded identical `summary` content in the
   * shared {@link SharedFindings} store (see {@link ParallelDelegateOptions.findings}).
   * The subtask still ran; this only flags the discovery as a duplicate. */
  deduped?: boolean
}

export interface ParallelDelegateDeps {
  runSubagent: (subtask: { id: string; title: string }) => Promise<SubagentOutcome>
}

/**
 * Minimal structural port over an {@link AgentClaimManager}-like claimer.
 * Declared here (not imported) so this module keeps zero dependency on the
 * SQLite store — the autonomy loop passes a concrete claimer in.
 *
 * Models the reconciliation layer of the LSTM §3 "parameter server": before a
 * worker touches a shared graph node it must claim it; a contended node yields
 * `null` so the fan-out skips it instead of double-running.
 */
export interface ClaimPort {
  /** Returns a lease (with `leaseToken`) on success, or `null` when another
   * agent already holds the resource. Must not throw on contention. */
  tryClaim: (resourceId: string, agentId: string) => { leaseToken: string } | null
  /** Release a previously acquired lease. Idempotent. */
  release: (leaseToken: string) => void
}

export interface ParallelDelegateOptions {
  signal?: AbortLike
  stopOnFailure?: boolean
  onResult?: (result: SubagentResult) => void
  /**
   * Optional token/cost ceiling for the fan-out. When present and exceeded,
   * further subagents are not launched and the report stops with
   * `'budget_exceeded'`. Absent → behavior is identical to today (unbounded).
   */
  budget?: BudgetGuard
  /**
   * Optional claim guard for safe concurrency over a shared graph. When present,
   * each subtask's node id is claimed before it runs and the lease released
   * after; a contended node is skipped (counted in `report.skipped`, never run
   * twice). Absent → no claiming, behavior identical to today.
   */
  claim?: ClaimPort
  /** Agent identity used when claiming. Defaults to `'delegate'`. */
  agentId?: string
  /**
   * Optional content-dedup store shared across the fan-out (see B5 —
   * {@link SharedFindings}). When present, each successful result's `summary`
   * is recorded; a summary a sibling already recorded is flagged
   * `deduped: true` on the result. Absent → no dedup, behavior identical to today.
   */
  findings?: SharedFindings
  /**
   * Optional cap on subagents running at once (§S0 MAX_CONCURRENT_HEAVY —
   * see {@link Semaphore}). Bounds memory pressure when a fan-out spawns many
   * heavy subagents (context/search/analyze) at once. Absent → unbounded,
   * behavior identical to today.
   */
  maxConcurrent?: number
}

export type DelegateStopReason = 'all_done' | 'aborted' | 'failure' | 'budget_exceeded'

export interface DelegateReport {
  results: SubagentResult[]
  completed: number
  failed: number
  /** Subtasks skipped because a peer already held the claim. Always 0 when no
   * {@link ParallelDelegateOptions.claim} guard is supplied. */
  skipped: number
  /** Results whose `summary` duplicated a sibling's. Always 0 when no
   * {@link ParallelDelegateOptions.findings} store is supplied. */
  deduped: number
  tokensUsed: number
  stopped: DelegateStopReason
}

export async function delegateSubtasksParallel(
  subtasks: Array<{ id: string; title: string }>,
  deps: ParallelDelegateDeps,
  options: ParallelDelegateOptions = {},
): Promise<DelegateReport> {
  const results: SubagentResult[] = []
  let completed = 0
  let failed = 0
  let skipped = 0
  let deduped = 0
  let tokensUsed = 0
  let stopped: DelegateStopReason = 'all_done'

  if (subtasks.length === 0) {
    return { results, completed, failed, skipped, deduped, tokensUsed, stopped }
  }

  if (options.signal?.aborted === true) {
    return { results, completed, failed, skipped, deduped, tokensUsed, stopped: 'aborted' }
  }

  // Run a subtask under the optional claim guard. When a claimer is supplied and
  // the node is already held by a peer, returns a `skipped` outcome without
  // running. Otherwise runs and always releases the lease (even on throw). With
  // no claimer this is a transparent pass-through — the default path is unchanged.
  async function guardedRun(subtask: { id: string; title: string }): Promise<SubagentOutcome & { skipped?: boolean }> {
    const claim = options.claim
    if (!claim) return deps.runSubagent(subtask)
    const lease = claim.tryClaim(subtask.id, options.agentId ?? 'delegate')
    if (!lease) {
      return { success: false, tokensUsed: 0, skipped: true, summary: 'skipped: claimed by peer' }
    }
    try {
      return await deps.runSubagent(subtask)
    } finally {
      claim.release(lease.leaseToken)
    }
  }

  // When a SharedFindings store is supplied, flag a result whose `summary`
  // duplicates one a sibling already recorded. Reconstructs (never mutates)
  // the result so the dedup check is a pure, order-independent side effect.
  function dedupeAgainstFindings(result: SubagentResult): SubagentResult {
    const findings = options.findings
    if (!findings || result.skipped === true || result.summary === undefined) return result
    const isNew = findings.add(result.summary)
    return isNew ? result : { ...result, deduped: true }
  }

  // Apply a settled outcome to the running tallies. Mutates closure state.
  function applyResult(rawResult: SubagentResult): void {
    const result = dedupeAgainstFindings(rawResult)
    results.push(result)
    tokensUsed += result.tokensUsed
    options.onResult?.(result)
    if (result.deduped === true) {
      deduped += 1
    }
    if (result.skipped === true) {
      skipped += 1
    } else if (result.success) {
      completed += 1
    } else {
      failed += 1
      if (options.stopOnFailure === true && stopped === 'all_done') {
        stopped = 'failure'
      }
    }
  }

  function applyRejection(reason: unknown): void {
    const message = reason instanceof Error ? reason.message : String(reason)
    results.push({ id: 'unknown', title: 'unknown', success: false, tokensUsed: 0, summary: message })
    failed += 1
    if (options.stopOnFailure === true && stopped === 'all_done') {
      stopped = 'failure'
    }
  }

  // Budget-guarded path: launch incrementally so we can stop the fan-out the
  // moment the ceiling trips. Only taken when a budget is provided — keeps the
  // default (unbounded) path below byte-for-byte identical to before.
  if (options.budget) {
    const budget = options.budget
    const signal = options.signal
    for (const subtask of subtasks) {
      if (signal?.aborted) {
        stopped = 'aborted'
        break
      }
      try {
        const outcome = await guardedRun(subtask)
        const result: SubagentResult = { id: subtask.id, title: subtask.title, ...outcome }
        applyResult(result)
        budget.add(outcome.tokens ?? outcome.tokensUsed ?? 0)
      } catch (error) {
        applyRejection(error)
      }
      if (budget.exceeded()) {
        if (stopped === 'all_done') stopped = 'budget_exceeded'
        log.warn('Parallel fan-out aborted: token budget exceeded', {
          lever: 'budget_guard',
          spent: budget.spent(),
          launched: results.length,
          total: subtasks.length,
        })
        break
      }
    }
    return { results, completed, failed, skipped, deduped, tokensUsed, stopped }
  }

  const semaphore = options.maxConcurrent ? new Semaphore({ max: options.maxConcurrent }) : undefined

  const outcomes = await Promise.allSettled(
    subtasks.map(async (subtask) => {
      if (options.signal?.aborted === true) {
        return { id: subtask.id, title: subtask.title, success: false, tokensUsed: 0, summary: 'aborted' }
      }
      const outcome = semaphore ? await semaphore.wrap(() => guardedRun(subtask)) : await guardedRun(subtask)
      return { id: subtask.id, title: subtask.title, ...outcome }
    }),
  )

  for (const outcome of outcomes) {
    if (outcome.status === 'fulfilled') {
      applyResult(outcome.value)
    } else {
      applyRejection(outcome.reason)
    }
  }

  return { results, completed, failed, skipped, deduped, tokensUsed, stopped }
}
