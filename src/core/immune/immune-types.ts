/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

export type DangerSignalKind =
  | 'raw_throw'
  | 'swallowed_catch'
  | 'console_error'
  | 'untyped_error'
  | 'repeated_failure'
  | 'regression_hotspot'
  | 'error_rate_spike'
  | 'graph_operation_failure'

export type AntigenKind =
  'bare_error' | 'swallowed_exception' | 'log_leak' | 'untyped_module' | 'cyclic_failure' | 'regression_cluster'

export type Severity = 'low' | 'medium' | 'high' | 'critical'

export type ImmuneStatus = 'detected' | 'presented' | 'responded' | 'recovered' | 'suppressed'

export type RecoveryActionKind =
  | 'add_typed_import'
  | 'wrap_in_try_catch'
  | 'replace_console'
  | 'add_error_boundary'
  | 'flag_for_review'
  | 'suppress'
  | 'defer'

export interface DangerSignal {
  id: string
  kind: DangerSignalKind
  file: string
  line: number
  evidence: string
  severity: Severity
  confidence: number
  detectedAt: number
  selfScore?: number
}

export interface Antigen {
  id: string
  kind: AntigenKind
  sourceSignals: string[]
  file: string
  line: number
  signature: string
  severity: Severity
  confidence: number
  selfScore?: number
}

export interface TCellResponse {
  id: string
  antigenId: string
  actionKind: RecoveryActionKind
  targetFile: string
  targetLine: number
  description: string
  affinity: number
  affinityScore?: AffinityScore
  applied: boolean
  appliedAt: number | null
}

export interface AffinityScore {
  historicalSuccessRate: number
  confidenceScore: number
  evidenceStrength: number
  recencyBonus: number
  total: number
}

export interface ImmuneMemoryEntry {
  signature: string
  antigenKind: AntigenKind
  file: string
  firstSeen: number
  lastSeen: number
  occurrences: number
  lastAction: RecoveryActionKind | null
  recoverySuccess: boolean
  suppressed: boolean
}

export interface MutationConfig {
  mutationRate: number
  actionKindSwapProbability: number
  lineShiftMax: number
  maxVariantsPerAntigen: number
}

export const DEFAULT_MUTATION_CONFIG: MutationConfig = {
  mutationRate: 0.15,
  actionKindSwapProbability: 0.1,
  lineShiftMax: 2,
  maxVariantsPerAntigen: 5,
}

export interface CostBenefitConfig {
  enabled: boolean
  expectedValueThreshold: number
  baseTokenCost: number
  perLineTokenCost: number
  minPSuccess: number
}

export const DEFAULT_COST_BENEFIT_CONFIG: CostBenefitConfig = {
  enabled: true,
  expectedValueThreshold: 0.3,
  baseTokenCost: 50,
  perLineTokenCost: 5,
  minPSuccess: 0.15,
}

export interface CostBenefitDecision {
  responseId: string
  estimatedTokenCost: number
  estimatedInputTokens: number
  estimatedOutputTokens: number
  historicalSuccessRate: number
  impactScore: number
  expectedValue: number
  threshold: number
  passed: boolean
  reason: string
}

export type VerificationKind = 'build_compile' | 'file_test' | 'noop'

export type VerificationStatus = 'passed' | 'failed' | 'skipped'

export interface VerificationResult {
  responseId: string
  actionKind: RecoveryActionKind
  kind: VerificationKind
  status: VerificationStatus
  error?: string
  durationMs: number
}

export interface ImmuneLedgerEntry {
  id: string
  cycleId: string
  signalsDetected: number
  antigensPresented: number
  responsesGenerated: number
  responsesApplied: number
  responsesGated: number
  responsesFailedVerify: number
  recoveryRate: number
  gatePassRate: number
  verificationPassRate: number
  estimatedTokensSaved: number
  estimatedTokensSpent: number
  durationMs: number
  createdAt: number
}

export interface ImmuneCycleResult {
  cycleId: string
  triggeredBy: 'manual' | 'done' | 'autopilot' | 'error_rate'
  signals: DangerSignal[]
  antigens: Antigen[]
  responses: TCellResponse[]
  costBenefitDecisions: CostBenefitDecision[]
  verificationResults: VerificationResult[]
  ledger: ImmuneLedgerEntry
  durationMs: number
}

export interface SelfProfile {
  signatures: string[]
  allFiles: string[]
  builtAt: number
}

export interface IdiotypicNetworkConfig {
  couplingConstant: number
  suppressionDecay: number
  stimulationGain: number
}

export const DEFAULT_IDIOTYPIC_NETWORK_CONFIG: IdiotypicNetworkConfig = {
  couplingConstant: 0.1,
  suppressionDecay: 0.5,
  stimulationGain: 0.02,
}

export interface ImmuneDashboardStats {
  totalCycles: number
  totalSignals: number
  totalAntigens: number
  totalResponsesGenerated: number
  totalResponsesApplied: number
  totalResponsesGated: number
  totalResponsesFailedVerify: number
  avgRecoveryRate: number
  avgGatePassRate: number
  avgVerificationPassRate: number
  topAntigenKinds: Array<{ kind: AntigenKind; count: number; recoveryRate: number }>
  topFilesBySignalDensity: Array<{ file: string; signalCount: number }>
  costBenefitSummary: {
    estimatedTokensSaved: number
    estimatedTokensSpent: number
    netTokenBenefit: number
  }
  trendByCycle: Array<{
    cycleId: string
    recoveryRate: number
    gatePassRate: number
    verificationPassRate: number
    durationMs: number
  }>
  lastCycleAt: number | null
}
