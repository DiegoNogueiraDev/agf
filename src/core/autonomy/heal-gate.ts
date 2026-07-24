/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Diagnose-only heal hook for the autonomous loop.
 *
 * Opt-in via `agf autopilot --heal-on-fail`: when a task fails, run the MAPE-K
 * healer as a **dry-run** (`apply:false`) so the graph is never auto-mutated,
 * and attach the diagnosis to the escalation detail. It deliberately never
 * retries — surfacing the structural cause to the human is the value, not a
 * blind re-run. Reuses `runHealing` (the engine behind `agf heal`).
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import { runHealing, type HealingRunResult } from '../skills/persist-healing.js'
import type { FailureContext, RecoveryDecision } from './autopilot-loop.js'
import { runRemediationLoop, type RemediationLlmPort, type RemediationResult } from '../autopilot/remediation-loop.js'
import { HelperRecordStore, resolveKnownFix, type KnownFixResolution } from './helper-record-store.js'
import { RecoveryRecipeEngine, type FailureKind, type RecoveryRecipe } from './recovery-recipes.js'

const KNOWN_FAILURE_KINDS: readonly FailureKind[] = [
  'llm_timeout',
  'llm_auth_error',
  'mcp_handshake_failure',
  'sandbox_crash',
  'provider_failure',
  'plugin_partial_startup',
  'unknown_failure',
]

/**
 * Classify a raw failure-kind string into its deterministic recovery recipe
 * (retryable, escalation policy, diagnostic) via the recovery-recipes engine.
 * Unrecognized kinds fall back to 'unknown_failure', exposed to `agf heal --recipe`.
 */
export function classifyFailure(kind: string, message = ''): RecoveryRecipe {
  const resolvedKind = (KNOWN_FAILURE_KINDS as string[]).includes(kind) ? (kind as FailureKind) : 'unknown_failure'
  return new RecoveryRecipeEngine().diagnose({ kind: resolvedKind, message })
}

/** Pure: turn a dry-run heal result into a (non-retrying) recovery decision. */
export function healingToRecovery(result: HealingRunResult): RecoveryDecision {
  return {
    retry: false,
    reason: `heal diagnose: ${result.detected} structural issue(s) detected (dry-run, no mutation)`,
  }
}

/** Build an `onFailure` hook that diagnoses (never mutates) via MAPE-K dry-run. */
export function buildHealDiagnose(store: SqliteStore): (ctx: FailureContext) => RecoveryDecision {
  return () => healingToRecovery(runHealing(store, { apply: false }))
}

/**
 * Look up a known fix for a failure signature (T3.3) — read path for the
 * project-scoped helper-record-store, exposed to `agf heal --known-fix`.
 */
export function lookupKnownFix(store: SqliteStore, signature: string, now: number): KnownFixResolution {
  const helperStore = new HelperRecordStore(store.getDb(), store.getProject()?.id ?? 'default')
  return resolveKnownFix(helperStore, signature, now)
}

/** Pure: convert a RemediationResult into the autopilot RecoveryDecision contract. */
export function remediationResultToRecovery(result: RemediationResult): RecoveryDecision {
  if (result.success) {
    return { retry: true, reason: `remediation succeeded in ${result.attempts} attempt(s)` }
  }
  return {
    retry: false,
    reason: `remediation exhausted ${result.attempts} attempt(s) without success`,
  }
}

export interface HealRemediateOptions {
  /** Source file to repair (passed to runRemediationLoop). */
  sourceFile: string
  /** Test file that is failing. */
  testFile: string
  /** Base model for the first attempts. Defaults to 'haiku'. */
  baseModel?: string
  /** Escalation model after threshold. Defaults to 'sonnet'. */
  escalationModel?: string
  /** Max remediation attempts. Defaults to 3. */
  maxAttempts?: number
}

/**
 * Build an `onFailure` hook that calls runRemediationLoop for real LLM-assisted
 * repair. Returns retry=true when the loop fixes the test, retry=false when
 * exhausted (budget guard respected by maxAttempts cap).
 */
export function buildHealRemediate(
  llm: RemediationLlmPort,
  opts: HealRemediateOptions,
): (ctx: FailureContext) => Promise<RecoveryDecision> {
  return async (ctx: FailureContext) => {
    const result = await runRemediationLoop(
      {
        nodeId: ctx.node.id,
        sourceFile: opts.sourceFile,
        sourceCode: '',
        testFile: opts.testFile,
        testErrorOutput: '',
        baseModel: opts.baseModel ?? 'haiku',
        escalationModel: opts.escalationModel ?? 'sonnet',
        maxAttempts: opts.maxAttempts ?? 3,
      },
      llm,
    )
    return remediationResultToRecovery(result)
  }
}
