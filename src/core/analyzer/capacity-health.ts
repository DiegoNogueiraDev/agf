/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-23.T02 — PLAN-phase capacity calibration metric.
 *
 * Compares the current sprint's planned xpSize-sum against the rolling
 * velocity average from prior sprints. Within ±10% is healthy; outside
 * means either over-commit or under-utilisation.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import { calculateVelocity } from '../planner/velocity.js'
import { XP_SIZE_POINTS } from '../utils/xp-sizing.js'

export interface CapacityHealthReport {
  sprintLabel: string | null
  sprintXpSizeSum: number
  velocityAvg: number
  deltaPct: number
  withinTolerance: boolean
  threshold: number
  reason: string
}

const TOLERANCE = 0.1

/**
 * Compute capacity calibration for the current (or specified) sprint.
 *
 * - sprintLabel: when undefined, uses the most-recent in_progress/ready
 *   sprint or any sprint with at least one in_progress task. Returns null
 *   when no sprint can be inferred (then deltaPct=0, passing trivially).
 */
export function computeCapacityHealth(doc: GraphDocument, sprintLabel?: string): CapacityHealthReport {
  // Resolve target sprint label.
  const targetSprint =
    sprintLabel ??
    doc.nodes
      .filter((n) => (n.type === 'task' || n.type === 'subtask') && n.status !== 'done' && n.sprint != null)
      .map((n) => n.sprint as string)
      .sort()[0]

  // Sum xpSize of tasks IN that sprint (any status).
  const sprintTasks = targetSprint
    ? doc.nodes.filter((n) => (n.type === 'task' || n.type === 'subtask') && n.sprint === targetSprint)
    : []
  const sprintXpSizeSum = sprintTasks.reduce((acc, t) => acc + (XP_SIZE_POINTS[t.xpSize ?? 'M'] ?? 3), 0)

  // Velocity average across all done sprints (excluding target).
  const velocity = calculateVelocity(doc)
  const priorSprints = velocity.sprints.filter((s) => s.sprint !== targetSprint)
  const velocityAvg =
    priorSprints.length > 0 ? priorSprints.reduce((acc, s) => acc + s.totalPoints, 0) / priorSprints.length : 0

  let deltaPct = 0
  if (velocityAvg > 0) {
    deltaPct = (sprintXpSizeSum - velocityAvg) / velocityAvg
  } else if (sprintXpSizeSum > 0) {
    // No prior history but a sprint is committed — flag as over since we
    // can't know if it's calibrated.
    deltaPct = 1
  }

  const withinTolerance = Math.abs(deltaPct) <= TOLERANCE
  let reason: string
  if (!targetSprint) {
    reason = 'Nenhum sprint detectado — capacity check trivialmente ok'
  } else if (priorSprints.length === 0 && sprintXpSizeSum > 0) {
    reason = `Sem velocity histórica para calibrar sprint ${targetSprint} (${sprintXpSizeSum}pts)`
  } else if (withinTolerance) {
    reason = `Sprint ${targetSprint} dentro de ±10% da velocity (${sprintXpSizeSum}pts vs avg ${velocityAvg.toFixed(1)}pts)`
  } else {
    reason = `Sprint ${targetSprint} desvia ${(deltaPct * 100).toFixed(1)}% da velocity (${sprintXpSizeSum}pts vs avg ${velocityAvg.toFixed(1)}pts)`
  }

  return {
    sprintLabel: targetSprint ?? null,
    sprintXpSizeSum,
    velocityAvg: Number(velocityAvg.toFixed(2)),
    deltaPct: Number(deltaPct.toFixed(3)),
    withinTolerance,
    threshold: TOLERANCE,
    reason,
  }
}
