/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * M7 — non-atomic task gaps. A leaf task too large to implement as one unit
 * (estimate >120min, xpSize ≥ L, or >5 AC) should be decomposed. `recommended`
 * (the driver decides how to split). Deterministic, ~0 token.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { Gap } from './gap-types.js'
import { nonAtomicTasks } from '../planner/atomicity.js'

export function detectAtomicity(doc: GraphDocument): Gap[] {
  return nonAtomicTasks(doc).map(({ node, reasons }) => ({
    kind: 'non_atomic_task',
    severity: 'recommended',
    nodeId: node.id,
    evidence: `Task ${node.id} não é atômica: ${reasons.join('; ')}`,
    enrichment: {
      action: 'decompose',
      instruction: `Decomponha ${node.id} em subtasks atômicas (≤2h, ≤5 AC, sem L/XL). Razões: ${reasons.join('; ')}`,
      applyVia: [
        `agf decompose ${node.id}`,
        `agf node add --type subtask --parent ${node.id} --title "<subtask atômica>"`,
      ],
    },
  }))
}
