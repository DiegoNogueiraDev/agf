/*!
 * Test-file linker — proposes 'verified_by' edges from tasks to their test files.
 * Task node_34dc9de7b572.
 *
 * WHY: Tasks with testFiles filled but no verified_by edge are invisible to
 * the traceability gap detector. This module closes that gap deterministically
 * by proposing edges the conducting agent can apply via `agf edge add`.
 * Idempotent: returns nothing when a verified_by edge already exists.
 *
 * Composes with: requirement-inferrer.ts (sister module), detect-traceability.ts.
 */

import type { GraphDocument } from '../graph/graph-types.js'

/** Proposal uses 'verified_by' as a human label; actual graph edge type is 'tests'. */
export interface TestEdgeProposal {
  from: string
  relationType: string
  testFile: string
  reason: string
  applyVia: string
}

/**
 * Propose verified_by edges for a task that has testFiles but no existing
 * tests edge. Returns [] when already linked (idempotent).
 */
export function inferTestFileEdges(doc: GraphDocument, taskId: string): TestEdgeProposal[] {
  const task = doc.nodes.find((n) => n.id === taskId)
  if (!task || task.type !== 'task') return []

  const testFiles = task.testFiles ?? []
  if (testFiles.length === 0) return []

  // Idempotent: skip if any outgoing 'tests' edge already exists from this task.
  const alreadyLinked = doc.edges.some((e) => e.from === taskId && e.relationType === 'tests')
  if (alreadyLinked) return []

  return testFiles.map((testFile) => ({
    from: taskId,
    relationType: 'verified_by',
    testFile,
    reason: `testFiles field references ${testFile}`,
    applyVia: `agf edge add --from ${taskId} --to "${testFile}" --type tests`,
  }))
}
