/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Immune System — Danger Theory + Clonal Selection error recovery.
 *
 * 5-phase bio-inspired expansion:
 *   Phase 1: Foundation — Static source scanning, antigen presentation,
 *            response generation, recovery, memory, ledger
 *   Phase 2: Affinity Maturation — Somatic hypermutation + clonal selection
 *            (Burnet Clonal Selection, Tonegawa SHM)
 *   Phase 3: Cost-Benefit Gate — Co-stimulation before response
 *            (Matzinger Danger Model, Charnov MVT)
 *   Phase 4: Runtime Danger Signals — llm_call_ledger + harness integration
 *            (Matzinger "stressed cells")
 *   Phase 5: Recovery Verification — Build check after fix, rollback
 *            (Clonal Deletion / Anergy)
 *   Phase 6: Immune Dashboard — Trend analysis, cost-benefit analytics
 *            (Epidemiological surveillance)
 */

import type Database from 'better-sqlite3'
import type { ImmuneCycleResult, VerificationResult, CostBenefitConfig } from './immune-types.js'
import { DEFAULT_COST_BENEFIT_CONFIG } from './immune-types.js'
import {
  detectDangerSignals,
  computeDangerScore,
  detectRuntimeSignals,
  mergeDangerSignals,
  dangerSignalsFromScannerViolations,
  detectGraphOperationFailures,
} from './danger-signal.js'
import { presentAntigens, deduplicateAntigens } from './antigen-presenter.js'
import { generateResponses } from './t-cell-responder.js'
import { readLocalMemory, upsertLocalMemory, mergeIntoGlobalMemory, readGlobalMemoryEntries } from './immune-memory.js'
import { applyRecovery } from './immune-recovery.js'
import { applyCostBenefitGate } from './cost-benefit-gate.js'
import { insertImmuneCycle, queryImmuneSummary, listImmuneCycles, queryImmuneDashboard } from './immune-ledger.js'
import { buildSelfProfile, enrichWithSelfScores } from './self-nonself.js'
import { regulateResponses } from './idiotypic-network.js'

export {
  detectDangerSignals,
  computeDangerScore,
  detectRuntimeSignals,
  mergeDangerSignals,
  dangerSignalsFromScannerViolations,
  detectGraphOperationFailures,
}
export { presentAntigens, deduplicateAntigens }
export { generateResponses }
export { readLocalMemory, upsertLocalMemory, mergeIntoGlobalMemory, readGlobalMemoryEntries }
export { applyRecovery, clearBackups } from './immune-recovery.js'
export { applyCostBenefitGate, evaluateResponse } from './cost-benefit-gate.js'
export { insertImmuneCycle, queryImmuneSummary, listImmuneCycles, queryImmuneDashboard }
export { buildSelfProfile, enrichWithSelfScores, computeSelfScore } from './self-nonself.js'
export { regulateResponses } from './idiotypic-network.js'
export type {
  DangerSignalKind,
  AntigenKind,
  Severity,
  ImmuneStatus,
  RecoveryActionKind,
  DangerSignal,
  Antigen,
  TCellResponse,
  AffinityScore,
  MutationConfig,
  CostBenefitConfig,
  CostBenefitDecision,
  VerificationResult,
  ImmuneMemoryEntry,
  ImmuneLedgerEntry,
  ImmuneCycleResult,
  ImmuneDashboardStats,
  SelfProfile,
  IdiotypicNetworkConfig,
} from './immune-types.js'
export {
  DEFAULT_MUTATION_CONFIG,
  DEFAULT_COST_BENEFIT_CONFIG,
  DEFAULT_IDIOTYPIC_NETWORK_CONFIG,
} from './immune-types.js'

interface ImmunizableFile {
  path: string
  content: string
}

/**
 * Run a full immune cycle: detect → present → gate → respond → verify → persist.
 * Returns the cycle result with all intermediate data for CLI output / ledgers.
 */
export function runImmuneCycle(
  db: Database.Database,
  projectId: string,
  files: ImmunizableFile[],
  triggeredBy: 'manual' | 'done' | 'autopilot' | 'error_rate' = 'manual',
  costBenefitConfig: CostBenefitConfig = DEFAULT_COST_BENEFIT_CONFIG,
): ImmuneCycleResult {
  const startMs = Date.now()
  const cycleId = `ic_${startMs}_${Math.random().toString(36).slice(2, 8)}`

  const staticSignals = detectDangerSignals(files)
  const runtimeSignals = detectRuntimeSignals(db, projectId)
  const signals = mergeDangerSignals(staticSignals, runtimeSignals)

  const selfProfile = buildSelfProfile(files)
  const scoredSignals = enrichWithSelfScores(signals, selfProfile)

  const memory = readLocalMemory(db, projectId)

  const priorSignatures = new Set<string>()
  for (const [, entries] of memory) {
    for (const e of entries) priorSignatures.add(e.signature)
  }

  const antigens = presentAntigens(scoredSignals)
  const novelAntigens = deduplicateAntigens(antigens, priorSignatures)

  let allResponses = generateResponses(novelAntigens, memory)
  allResponses = regulateResponses(allResponses)

  const { passed, gated, decisions } = applyCostBenefitGate(allResponses, novelAntigens, memory, costBenefitConfig)

  const recoveryResults = applyRecovery(passed)

  const responsesApplied = recoveryResults.filter((r) => r.success).length
  const responsesFailedVerify = recoveryResults.filter((r) => r.verification?.status === 'failed').length

  for (const response of passed) {
    if (response.applied) {
      const result = recoveryResults.find((r) => r.responseId === response.id)
      const verifyPassed = result?.verification?.status !== 'failed'
      upsertLocalMemory(db, projectId, {
        signature: `mem_${response.targetFile}_${response.actionKind}`,
        antigenKind: novelAntigens.find((a) => a.id === response.antigenId)?.kind ?? 'bare_error',
        file: response.targetFile,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        occurrences: 1,
        lastAction: response.actionKind,
        recoverySuccess: response.applied && verifyPassed,
        suppressed: false,
      })
    }
  }

  mergeIntoGlobalMemory(db, projectId)

  const durationMs = Date.now() - startMs
  const totalAttempted = allResponses.length + gated.length
  const recoveryRate = passed.length > 0 ? responsesApplied / passed.length : 0
  const gatePassRate = allResponses.length > 0 ? passed.length / allResponses.length : 0
  const verificationPassRate = responsesApplied > 0 ? (responsesApplied - responsesFailedVerify) / responsesApplied : 0

  const estimatedTokensSpent = passed.length * DEFAULT_COST_BENEFIT_CONFIG.baseTokenCost
  const estimatedTokensSaved = gated.length * DEFAULT_COST_BENEFIT_CONFIG.baseTokenCost

  const ledgerEntry = {
    id: `il_${cycleId}`,
    cycleId,
    signalsDetected: signals.length,
    antigensPresented: antigens.length,
    responsesGenerated: totalAttempted,
    responsesApplied,
    responsesGated: gated.length,
    responsesFailedVerify,
    recoveryRate,
    gatePassRate,
    verificationPassRate,
    estimatedTokensSaved,
    estimatedTokensSpent,
    durationMs,
    createdAt: Date.now(),
  }

  insertImmuneCycle(db, projectId, ledgerEntry)

  return {
    cycleId,
    triggeredBy,
    signals,
    antigens,
    responses: allResponses,
    costBenefitDecisions: decisions,
    verificationResults: recoveryResults
      .map((r) => r.verification)
      .filter((v): v is VerificationResult => v !== undefined),
    ledger: ledgerEntry,
    durationMs,
  }
}
