/*!
 * Requirement inferrer — proposes 'implements' edges from tasks to requirements.
 * Task node_50904b575080.
 *
 * WHY: The gap detector flags missing traceability (req→task→test). This module
 * infers candidate edges deterministically via shared tags on sibling nodes,
 * giving the conducting agent concrete `agf edge add` commands to apply.
 * Pure, ~0 token, no LLM.
 *
 * Composes with: detect-traceability.ts (gap kind), gap-types.ts (applyVia pattern).
 */

import type { GraphDocument } from '../graph/graph-types.js'

export interface EdgeProposal {
  from: string
  to: string
  relationType: 'implements'
  reason: string
  applyVia: string
}

/**
 * Infer `implements` edges from a task to sibling requirements via shared tags.
 * Returns an empty array when the task is already linked or no tag match exists.
 */
export function inferRequirementEdges(doc: GraphDocument, taskId: string): EdgeProposal[] {
  const task = doc.nodes.find((n) => n.id === taskId)
  if (!task || task.type !== 'task') return []

  // If already has any implements edge, nothing to infer.
  const alreadyLinked = doc.edges.some((e) => e.from === taskId && e.relationType === 'implements')
  if (alreadyLinked) return []

  const taskTags = new Set(task.tags ?? [])
  if (taskTags.size === 0) return []

  const proposals: EdgeProposal[] = []
  for (const n of doc.nodes) {
    if (n.id === taskId || n.type !== 'requirement') continue
    const sharedTags = (n.tags ?? []).filter((t) => taskTags.has(t))
    if (sharedTags.length === 0) continue
    proposals.push({
      from: taskId,
      to: n.id,
      relationType: 'implements',
      reason: `Shared tags: ${sharedTags.join(', ')}`,
      applyVia: `agf edge add --from ${taskId} --to ${n.id} --type implements`,
    })
  }

  return proposals
}
