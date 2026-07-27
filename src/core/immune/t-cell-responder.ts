/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * T-Cell Responder — Clonal Selection + Somatic Hypermutation.
 *
 * Full affinity maturation pipeline:
 *   1. Generate template responses from ACTION_MAP
 *   2. Apply somatic hypermutation: mutate action kind, line offset, description
 *   3. Score each variant on a multi-factor affinity function
 *   4. Select the highest-affinity variant per antigen (clonal selection)
 *
 * Bio foundation: Burnet's Clonal Selection Theory + Tonegawa's
 * somatic hypermutation. Real B-cells mutate receptor genes during
 * proliferation; cells with higher-affinity receptors receive survival
 * signals and dominate the response.
 */

import type {
  Antigen,
  TCellResponse,
  RecoveryActionKind,
  ImmuneMemoryEntry,
  AffinityScore,
  MutationConfig,
} from './immune-types.js'
import { DEFAULT_MUTATION_CONFIG } from './immune-types.js'

let responseCounter = 0

function nextResponseId(): string {
  responseCounter++
  return `tc_${Date.now()}_${responseCounter}`
}

interface ActionTemplate {
  kind: RecoveryActionKind
  description(file: string, line: number): string
  baseAffinity: number
}

const ACTION_MAP: Record<string, ActionTemplate[]> = {
  bare_error: [
    {
      kind: 'add_typed_import',
      description: (f, l) => `Add typed error import and replace raw Error at ${f}:${l}`,
      baseAffinity: 0.9,
    },
    {
      kind: 'flag_for_review',
      description: (f, l) => `Flag bare Error throw at ${f}:${l} for manual review`,
      baseAffinity: 0.5,
    },
  ],
  swallowed_exception: [
    {
      kind: 'wrap_in_try_catch',
      description: (f, l) => `Add logger call or rethrow in empty catch at ${f}:${l}`,
      baseAffinity: 0.95,
    },
    {
      kind: 'flag_for_review',
      description: (f, l) => `Flag empty catch at ${f}:${l} for manual review`,
      baseAffinity: 0.4,
    },
  ],
  log_leak: [
    {
      kind: 'replace_console',
      description: (f, l) => `Replace console.error/warn with structured logger at ${f}:${l}`,
      baseAffinity: 0.85,
    },
  ],
  cyclic_failure: [
    {
      kind: 'add_error_boundary',
      description: (f, l) => `Add recoverable error boundary for cyclic failures at ${f}:${l}`,
      baseAffinity: 0.7,
    },
    {
      kind: 'flag_for_review',
      description: (f, l) => `Escalate cyclic failure at ${f}:${l} for deep investigation`,
      baseAffinity: 0.6,
    },
  ],
  regression_cluster: [
    {
      kind: 'defer',
      description: (f, l) => `Defer regression cluster at ${f}:${l} to dedicated bug hunt`,
      baseAffinity: 0.3,
    },
  ],
}

function lookupMemoryEntries(
  antigen: Antigen,
  actionKind: RecoveryActionKind,
  memory: Map<string, ImmuneMemoryEntry[]>,
): ImmuneMemoryEntry[] {
  const entries = memory.get(antigen.file) ?? []
  return entries.filter((e) => e.antigenKind === antigen.kind && e.lastAction === actionKind)
}

function computeHistoricalSuccessRate(matching: ImmuneMemoryEntry[]): number {
  if (matching.length === 0) return 0
  const successes = matching.filter((e) => e.recoverySuccess).length
  return successes / matching.length
}

function computeRecencyBonus(matching: ImmuneMemoryEntry[]): number {
  if (matching.length === 0) return 0
  const now = Date.now()
  const day = 86_400_000
  const recent = matching.filter((e) => now - e.lastSeen < day * 7).length
  return Math.min(0.15, recent * 0.05)
}

function computeConfidenceScore(antigen: Antigen, _matching: ImmuneMemoryEntry[]): number {
  return antigen.confidence
}

function computeEvidenceStrength(antigen: Antigen): number {
  const severityWeight: Record<string, number> = { low: 0.3, medium: 0.5, high: 0.8, critical: 1.0 }
  return severityWeight[antigen.severity] ?? 0.3
}

/**
 * Multi-factor affinity scoring function.
 *
 * Components (Burnet Clonal Selection):
 * - Historical success rate: what worked before for this antigen kind + action
 * - Confidence: how sure we are about the antigen classification
 * - Evidence strength: severity-weighted impact of the underlying problem
 * - Recency bonus: recent successes are weighted more heavily
 */
function scoreAffinity(
  antigen: Antigen,
  actionKind: RecoveryActionKind,
  memory: Map<string, ImmuneMemoryEntry[]>,
): { affinity: number; score: AffinityScore } {
  const matching = lookupMemoryEntries(antigen, actionKind, memory)

  const historicalSuccessRate = computeHistoricalSuccessRate(matching)
  const recencyBonus = computeRecencyBonus(matching)
  const confidenceScore = computeConfidenceScore(antigen, matching)
  const evidenceStrength = computeEvidenceStrength(antigen)

  const total = Math.min(
    1.0,
    historicalSuccessRate * 0.4 + confidenceScore * 0.25 + evidenceStrength * 0.25 + recencyBonus * 0.1,
  )

  return {
    affinity: total,
    score: {
      historicalSuccessRate,
      confidenceScore,
      evidenceStrength,
      recencyBonus,
      total,
    },
  }
}

/**
 * Somatic hypermutation: mutate response parameters to generate diverse
 * antibody/receptor variants. The T-Cell responder mutates:
 *   - actionKind (with configurable probability)
 *   - targetLine (shift up/down by up to lineShiftMax)
 *   - description (reflect the mutation)
 *
 * All variants start from a template and are scored independently.
 */
function somaticHypermutation(
  antigen: Antigen,
  template: ActionTemplate,
  _config: MutationConfig,
  memory: Map<string, ImmuneMemoryEntry[]>,
): TCellResponse[] {
  const variants: TCellResponse[] = []

  const availableKinds: RecoveryActionKind[] = [
    'add_typed_import',
    'wrap_in_try_catch',
    'replace_console',
    'add_error_boundary',
    'flag_for_review',
    'suppress',
    'defer',
  ]

  const candidateActionKinds: RecoveryActionKind[] = [template.kind]

  if (Math.random() < _config.actionKindSwapProbability) {
    const others = availableKinds.filter((k) => k !== template.kind)
    candidateActionKinds.push(others[Math.floor(Math.random() * others.length)])
  }

  const lineShifts = [0]
  if (Math.random() < _config.mutationRate) {
    const shift = Math.floor(Math.random() * (_config.lineShiftMax * 2 + 1)) - _config.lineShiftMax
    if (shift !== 0) lineShifts.push(shift)
  }

  for (const actionKind of candidateActionKinds) {
    for (const shift of lineShifts) {
      const mutatedLine = Math.max(1, antigen.line + shift)
      const suffix = shift !== 0 ? ` (hypermutated line:${shift > 0 ? '+' : ''}${shift})` : ''
      const description = `${template.description(antigen.file, mutatedLine)}${suffix}`

      const { affinity, score } = scoreAffinity(antigen, actionKind, memory)

      variants.push({
        id: nextResponseId(),
        antigenId: antigen.id,
        actionKind,
        targetFile: antigen.file,
        targetLine: mutatedLine,
        description,
        affinity,
        affinityScore: score,
        applied: false,
        appliedAt: null,
      })
    }
  }

  return variants
}

/**
 * Clonal selection: pick the highest-affinity variant per antigen.
 * Responses below the affinity threshold are filtered out (anergic/deleted).
 */
function clonalSelection(variants: TCellResponse[], affinityThreshold = 0.15): TCellResponse[] {
  const selected: TCellResponse[] = []

  const byAntigen = new Map<string, TCellResponse[]>()
  for (const v of variants) {
    if (v.affinity < affinityThreshold) continue
    if (!byAntigen.has(v.antigenId)) byAntigen.set(v.antigenId, [])
    byAntigen.get(v.antigenId)!.push(v)
  }

  for (const [, group] of byAntigen) {
    group.sort((a, b) => b.affinity - a.affinity)
    if (group.length > 0) selected.push(group[0])
  }

  return selected
}

/**
 * Generate T-Cell responses using full affinity maturation pipeline:
 *   1. Create template responses per antigen kind
 *   2. Apply somatic hypermutation to generate diverse variants
 *   3. Score each variant with multi-factor affinity
 *   4. Select highest-affinity variant per antigen (clonal selection)
 */
export function generateResponses(
  antigens: Antigen[],
  memory: Map<string, ImmuneMemoryEntry[]>,
  config: MutationConfig = DEFAULT_MUTATION_CONFIG,
): TCellResponse[] {
  const allVariants: TCellResponse[] = []

  for (const antigen of antigens) {
    const templates = ACTION_MAP[antigen.kind]
    if (!templates) continue

    for (const tmpl of templates) {
      const variants = somaticHypermutation(antigen, tmpl, config, memory)
      allVariants.push(...variants)
    }
  }

  const selected = clonalSelection(allVariants)
  return selected.sort((a, b) => b.affinity - a.affinity)
}

/**
 * Legacy selector — kept for compatibility but clonal selection
 * is now integrated into generateResponses.
 */
export function selectResponses(responses: TCellResponse[], maxPerAntigen = 1): TCellResponse[] {
  const seen = new Set<string>()
  const selected: TCellResponse[] = []

  for (const r of responses) {
    if (!seen.has(r.antigenId)) {
      seen.add(r.antigenId)
      selected.push(r)
    }
    if (selected.length >= maxPerAntigen * new Set(responses.map((r) => r.antigenId)).size) break
  }

  return selected
}
