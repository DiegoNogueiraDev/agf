/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Task decomposition: detects large tasks and suggests breakdown.
 *
 * A task is considered "large" if:
 * - estimateMinutes > 120 (2 hours)
 * - xpSize is L or XL
 * - Has more than 5 acceptance criteria (complex scope)
 */

import type { GraphDocument, GraphNode } from '../graph/graph-types.js'
import { XP_SIZE_ORDER } from '../utils/xp-sizing.js'
import { getNodeAcTexts } from '../utils/ac-helpers.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'decompose.ts' })

const ESTIMATE_THRESHOLD = 120 // minutes
const AC_THRESHOLD = 5
const LARGE_XP_THRESHOLD = 4 // L=4, XL=5

export interface DecomposeResult {
  node: GraphNode
  reasons: string[]
  suggestedSubtasks: SuggestedSubtask[]
}

export interface SuggestedSubtask {
  title: string
  estimateMinutes?: number
  xpSize: string
  basedOn: string
}

/**
 * Detect large tasks in the graph that should be decomposed.
 */
export function detectLargeTasks(doc: GraphDocument): DecomposeResult[] {
  const results: DecomposeResult[] = []

  // Bug #031: include epics — large epics without children need decomposition too
  const tasks = doc.nodes.filter(
    (n) => (n.type === 'task' || n.type === 'subtask' || n.type === 'epic') && n.status !== 'done',
  )

  for (const node of tasks) {
    const reasons: string[] = []

    if (node.estimateMinutes && node.estimateMinutes > ESTIMATE_THRESHOLD) {
      reasons.push(`estimate ${node.estimateMinutes}min > ${ESTIMATE_THRESHOLD}min threshold`)
    }

    const sizeOrder = XP_SIZE_ORDER[node.xpSize || 'M'] ?? 3
    if (sizeOrder >= LARGE_XP_THRESHOLD) {
      reasons.push(`XP size ${node.xpSize} is large`)
    }

    const acCount = getNodeAcTexts(doc, node.id).length
    if (acCount > AC_THRESHOLD) {
      reasons.push(`${acCount} acceptance criteria > ${AC_THRESHOLD} threshold`)
    }

    // Bug #031: empty epics always need decomposition regardless of size criteria
    if (reasons.length === 0 && node.type === 'epic') {
      const hasChildrenForEpic = doc.nodes.some((n) => n.parentId === node.id)
      if (!hasChildrenForEpic) {
        reasons.push('epic without children — needs decomposition')
      }
    }

    if (reasons.length === 0) continue

    // Check if already decomposed (has children)
    const hasChildren = doc.nodes.some((n) => n.parentId === node.id)
    if (hasChildren) continue

    const suggestedSubtasks = suggestDecomposition(doc, node)

    results.push({ node, reasons, suggestedSubtasks })
  }

  log.info(`Decomposition: ${results.length} large tasks detected from ${tasks.length} total`)
  return results
}

/**
 * Suggest subtask breakdown based on acceptance criteria and estimate.
 */
function suggestDecomposition(doc: GraphDocument, node: GraphNode): SuggestedSubtask[] {
  const subtasks: SuggestedSubtask[] = []
  const ac = getNodeAcTexts(doc, node.id)

  if (ac.length > 0) {
    // Bug #088: use estimate-based target chunks instead of always 3
    const TARGET_SUBTASK_MINUTES = 60
    const targetChunks = node.estimateMinutes
      ? Math.max(2, Math.ceil(node.estimateMinutes / TARGET_SUBTASK_MINUTES))
      : Math.max(2, Math.ceil(ac.length / 3))
    const chunkSize = Math.max(1, Math.ceil(ac.length / targetChunks))

    for (let i = 0; i < ac.length; i += chunkSize) {
      const chunk = ac.slice(i, i + chunkSize)
      const title =
        chunk.length === 1
          ? chunk[0]
          : `${chunk[0].slice(0, 60)}${chunk.length > 1 ? ` (+${chunk.length - 1} criteria)` : ''}`

      const estPerSubtask = node.estimateMinutes
        ? Math.ceil(node.estimateMinutes / Math.ceil(ac.length / chunkSize))
        : undefined

      subtasks.push({
        title,
        estimateMinutes: estPerSubtask,
        xpSize: estimateSubtaskSize(estPerSubtask),
        basedOn: 'acceptance_criteria',
      })
    }
  } else if (node.estimateMinutes && node.estimateMinutes > ESTIMATE_THRESHOLD) {
    // No AC — split by time estimate
    const numParts = Math.ceil(node.estimateMinutes / 60)
    const estPerPart = Math.ceil(node.estimateMinutes / numParts)

    for (let i = 0; i < numParts; i++) {
      subtasks.push({
        title: `${node.title} — part ${i + 1}/${numParts}`,
        estimateMinutes: estPerPart,
        xpSize: estimateSubtaskSize(estPerPart),
        basedOn: 'time_split',
      })
    }
  }

  return subtasks
}

/**
 * REQ-LCR-002 gate: an XS-sized task with zero acceptance criteria is a signal
 * that it may be an under-specified composite task in disguise (see risk
 * matrix behind REQ-LCR — deliberately narrow to avoid
 * over-decomposing genuinely simple tasks).
 */
export function needsHtnDecomposeGuard(xpSize: string | undefined, acCount: number): boolean {
  return xpSize === 'XS' && acCount === 0
}

function estimateSubtaskSize(minutes?: number): string {
  if (!minutes) return 'S'
  if (minutes <= 15) return 'XS'
  if (minutes <= 30) return 'S'
  if (minutes <= 60) return 'M'
  if (minutes <= 120) return 'L'
  return 'XL'
}
