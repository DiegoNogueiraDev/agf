/*!
 * Epic promotion gate — blocks epic promotion when children have required gaps.
 * Task node_ad23efd7d9f2.
 *
 * WHY: Promoting an epic to done while children still have required completeness
 * gaps (missing AC, unresolved blockers, invalid status) silently hides debt.
 * This gate runs detectAllGaps on each child and blocks if any required gap exists.
 * Pure, deterministic, ~0 token.
 *
 * Composes with: epic-promotion.ts (promotion logic), detect-all-gaps.ts,
 * definition-of-done.ts (required checks).
 */

import type Database from 'better-sqlite3'
import type { GraphDocument } from '../graph/graph-types.js'
import { checkDefinitionOfDone } from '../implementer/definition-of-done.js'

/** Corte de harness abaixo do qual a promoção de épico é recusada. */
export const HARNESS_PROMOTION_THRESHOLD = 70

export type EpicHarnessCode = 'HARNESS_BELOW_PROMOTION' | 'HARNESS_UNKNOWN'

export interface EpicHarnessGateResult {
  /** true só quando há histórico E o score < threshold (cold start nunca bloqueia). */
  blocked: boolean
  /** Último score lido; null em cold start. */
  score: number | null
  /** Veredito tipado: BELOW bloqueia, UNKNOWN é apenas aviso. */
  code?: EpicHarnessCode
  reason: string
}

/**
 * Gate de qualidade (harness ≥ threshold) para a promoção de épico
 * (node_aff3a524791d; Item 5 do mapa TTM). Trazer o corte que hoje só existe no
 * gate deploy para a promoção de épico encurta o ciclo de feedback de qualidade.
 * Score < threshold ⇒ recusa com HARNESS_BELOW_PROMOTION; SEM histórico (cold
 * start) ⇒ nunca bloqueia — avisa com HARNESS_UNKNOWN para não travar projeto
 * novo. Puro; o caller lê o score via {@link readLastHarnessScore}.
 * Fundamento: Accelerate (Forsgren et al. 2018 — qualidade habilita velocidade)
 * + Fowler design-stamina hypothesis.
 */
export function checkEpicHarnessGate(lastScore: number | null): EpicHarnessGateResult {
  if (lastScore === null) {
    return {
      blocked: false,
      score: null,
      code: 'HARNESS_UNKNOWN',
      reason: 'Sem harness_history — cold start, promoção liberada com aviso',
    }
  }
  if (lastScore < HARNESS_PROMOTION_THRESHOLD) {
    return {
      blocked: true,
      score: lastScore,
      code: 'HARNESS_BELOW_PROMOTION',
      reason: `Harness score ${lastScore} < ${HARNESS_PROMOTION_THRESHOLD} — resolva a qualidade antes de promover o épico`,
    }
  }
  return { blocked: false, score: lastScore, reason: `Harness score ${lastScore} >= ${HARNESS_PROMOTION_THRESHOLD}` }
}

/**
 * Lê o último score de harness_history (reuso do padrão de gate-cmd/harness-preflight,
 * sem re-scan). Tabela ausente/erro ⇒ null (cold start, nunca quebra a promoção).
 */
export function readLastHarnessScore(db: Database.Database): number | null {
  try {
    const row = db.prepare('SELECT score FROM harness_history ORDER BY timestamp DESC LIMIT 1').get() as
      { score: number } | undefined
    return row && typeof row.score === 'number' ? row.score : null
  } catch {
    return null
  }
}

export interface EpicGateResult {
  epicId: string
  blocked: boolean
  requiredGapCount: number
  reason: string
  gapsByChild: Array<{ childId: string; gapCount: number }>
}

/**
 * Check whether an epic can be promoted based on required gaps in its children.
 * Blocks if any direct child task/subtask has ≥1 required gap.
 */
export function checkEpicPromotionGate(doc: GraphDocument, epicId: string): EpicGateResult {
  const children = doc.nodes.filter((n) => n.parentId === epicId && (n.type === 'task' || n.type === 'subtask'))

  if (children.length === 0) {
    return { epicId, blocked: false, requiredGapCount: 0, reason: 'No children to validate', gapsByChild: [] }
  }

  const gapsByChild: Array<{ childId: string; gapCount: number }> = []
  let totalRequired = 0

  for (const child of children) {
    const dod = checkDefinitionOfDone(doc, child.id)
    const requiredCount = dod.checks.filter((c) => c.severity === 'required' && !c.passed).length
    if (requiredCount > 0) {
      gapsByChild.push({ childId: child.id, gapCount: requiredCount })
      totalRequired += requiredCount
    }
  }

  const blocked = totalRequired > 0
  return {
    epicId,
    blocked,
    requiredGapCount: totalRequired,
    reason: blocked
      ? `${totalRequired} required gap(s) in children — resolve before promoting epic`
      : 'All children pass required gap checks',
    gapsByChild,
  }
}
