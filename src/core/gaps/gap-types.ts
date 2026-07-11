/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Gap protocol — the "detect → delegate → verify" contract for the SHAPE
 * completeness harness.
 *
 * A {@link Gap} is a deterministically-detected incompleteness in the graph
 * (zero LLM, zero tokens). Its {@link EnrichmentRequest} is a CLI-agnostic,
 * machine-readable ask that the CONDUCTING agent (any CLI: Copilot, Claude Code,
 * OpenCode, Cursor, Gemini…) acts on via plain `agf` commands (`applyVia`). agf
 * only DETECTS and re-VERIFIES; the driver's reasoning fills the semantics for
 * free — so the outcome is deterministic regardless of which CLI enriched it.
 */

export const GAP_KINDS = [
  'traceability_break',
  'ac_coverage_break',
  'weak_ac_testability',
  'missing_nfr',
  'missing_edge_case',
  'ambiguous_ac',
  'non_atomic_task',
  'design_drift',
  'estimate_drift',
  'blocking_container',
  'stale_container',
  'duplicate_prd',
  // Anti-hallucination triangulation: a `done` task whose declared testFiles do
  // not exist on disk — the graph claims delivery no real test backs (golden rule).
  'phantom_done',
] as const
export type GapKind = (typeof GAP_KINDS)[number]

/** What the driver should do to close the gap. */
export type EnrichmentAction = 'add_nodes' | 'add_edges' | 'rewrite_ac' | 'clarify' | 'decompose' | 'annotate'

/** The CLI-agnostic delegation payload — consumed by ANY conducting CLI. */
export interface EnrichmentRequest {
  /** The kind of mutation the driver should make. */
  action: EnrichmentAction
  /** Imperative, provider-neutral instruction. */
  instruction: string
  /** For `clarify`/ambiguous gaps: the alternatives agf would otherwise guess. */
  options?: string[]
  /** Exact `agf` commands that persist the answer (e.g. `agf edge add …`). */
  applyVia: string[]
}

export type GapSeverity = 'required' | 'recommended'

/** A single deterministically-detected completeness gap. */
export interface Gap {
  kind: GapKind
  severity: GapSeverity
  /** Node the gap is anchored to, when applicable. */
  nodeId?: string
  /** Deterministic proof of the gap ("AC#3 has no `tests` edge"). */
  evidence: string
  /** How the driver closes it. */
  enrichment: EnrichmentRequest
}

/** Aggregated report — mirrors GateReport ({ checks, ready, score, grade, summary }). */
export interface GapReport {
  gaps: Gap[]
  byKind: Record<GapKind, number>
  /** false iff any `required` gap remains. */
  ready: boolean
  score: number
  grade: string
  summary: string
}

const REQUIRED_PENALTY = 15
const RECOMMENDED_PENALTY = 3

/** Deterministic A–F grade from a 0–100 score (harness convention). */
export function gapGradeFromScore(score: number): string {
  if (score >= 85) return 'A'
  if (score >= 70) return 'B'
  if (score >= 55) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

/** Build the aggregated, deterministic GapReport from raw gaps. */
export function buildGapReport(gaps: Gap[]): GapReport {
  const byKind = Object.fromEntries(GAP_KINDS.map((k) => [k, 0])) as Record<GapKind, number>
  let required = 0
  let recommended = 0
  for (const g of gaps) {
    byKind[g.kind] += 1
    if (g.severity === 'required') required += 1
    else recommended += 1
  }
  const score = Math.max(0, 100 - required * REQUIRED_PENALTY - recommended * RECOMMENDED_PENALTY)
  const ready = required === 0
  const grade = gapGradeFromScore(score)
  const summary =
    gaps.length === 0
      ? 'Sem lacunas — completo'
      : `${gaps.length} lacuna(s): ${required} required, ${recommended} recommended`
  return { gaps, byKind, ready, score, grade, summary }
}
