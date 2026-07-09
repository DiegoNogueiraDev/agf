/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Detects container epics that block child tasks without having own work.
 *
 * A "container epic" is an epic that:
 *  1. Has no acceptance criteria of its own (it only aggregates tasks)
 *  2. Is not yet done (so it's actively blocking)
 *  3. Has at least one child task/subtask
 *  4. All children are still in backlog/ready (never started)
 *
 * These epics are created by `agf import-prd --build-tree` as structural
 * containers and should be auto-promoted to done so their children can flow.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { Gap } from './gap-types.js'
import { getNodeAcTexts } from '../utils/ac-helpers.js'

export function detectBlockingContainer(doc: GraphDocument): Gap[] {
  const gaps: Gap[] = []

  for (const node of doc.nodes) {
    if (node.type !== 'epic' || node.status === 'done') continue

    // Container epic = no own AC
    if (getNodeAcTexts(doc, node.id).length > 0) continue

    // Must have at least one child
    const children = doc.nodes.filter((n) => n.parentId === node.id)
    if (children.length === 0) continue

    // All children must be unstarted (backlog or ready)
    const allUnstarted = children.every((n) => n.status === 'backlog' || n.status === 'ready')
    if (!allUnstarted) continue

    gaps.push({
      // AUDIT-063: a fresh container epic with backlog children is normal at
      // cycle start — it must NOT gate readiness as `required` nor advise a
      // blind `done --force` (which would close an epic with incomplete work).
      kind: 'blocking_container',
      severity: 'recommended',
      nodeId: node.id,
      evidence: `Épico "${node.title}" (${node.id}) sem AC próprio — ${children.length} tarefa(s) filha(s) em ${node.status}.`,
      enrichment: {
        action: 'annotate',
        instruction: `Épico container detectado. Se tem trabalho real, adicione AC. Só marque done quando as ${children.length} tarefa(s) filha(s) estiverem concluídas.`,
        applyVia: [`agf node add --type acceptance_criteria --parent ${node.id} --title "<critério>"`],
      },
    })
  }

  return gaps
}
