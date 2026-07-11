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

import type { GraphDocument } from '../graph/graph-types.js'
import { checkDefinitionOfDone } from '../implementer/definition-of-done.js'

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
