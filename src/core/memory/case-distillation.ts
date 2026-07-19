/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Case-based experiential memory distillation.
 *
 * Paper §4.2.1 (Case-based Memory) + §5.1.1 (Semantic Summarization) from
 * Hu et al. (2026). When a task finishes with grade A, a non-trivial
 * rationale, and observed test files, distill the trajectory into a memory
 * the next similar task can retrieve via RAG. Pure function — caller decides
 * when to invoke writeMemory with the returned payload.
 */

import type { GraphNode } from '../graph/graph-types.js'

export const MIN_RATIONALE_LENGTH = 100

export interface BuildCaseMemoryInput {
  node: GraphNode
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  rationale: string
  testFiles: readonly string[]
}

export interface BuildCaseMemoryResult {
  shouldWrite: boolean
  name?: string
  content?: string
  reason?: string
}

/**
 * Decide whether to distill, and if so produce the memory file payload.
 * Gates (all required for shouldWrite=true):
 *   - DoD grade is A (the task earned the highest confidence in DoD)
 *   - rationale length ≥ MIN_RATIONALE_LENGTH (meaningful explanation)
 *   - at least one test file was observed (verifiable trajectory)
 */
export function buildCaseMemory(input: BuildCaseMemoryInput): BuildCaseMemoryResult {
  const { node, grade, rationale, testFiles } = input

  if (grade !== 'A') {
    return { shouldWrite: false, reason: `grade=${grade} (need A)` }
  }
  if (!rationale || rationale.length < MIN_RATIONALE_LENGTH) {
    return { shouldWrite: false, reason: `rationale length ${rationale?.length ?? 0} < ${MIN_RATIONALE_LENGTH}` }
  }
  if (!testFiles || testFiles.length === 0) {
    return { shouldWrite: false, reason: 'no test files observed' }
  }

  const date = new Date().toISOString().slice(0, 10)
  const name = `case_${node.id}_${date}`
  const tags = Array.from(new Set([...(node.tags ?? []), 'experiential', 'case-based']))
  const acceptanceCriteria = node.acceptanceCriteria ?? []

  const content = [
    '---',
    `name: ${name}`,
    `description: Case-based memory distilled from grade-A finish of "${node.title}". Tags: ${tags.join(', ')}.`,
    `type: feedback`,
    '---',
    '',
    `# Case: ${node.title}`,
    '',
    `**Source node:** \`${node.id}\` (type=${node.type}, priority=${node.priority ?? '?'})`,
    `**Distilled at:** ${date}`,
    `**Tags:** ${tags.join(', ')}`,
    '',
    '## Acceptance criteria that drove the work',
    '',
    ...(acceptanceCriteria.length > 0
      ? acceptanceCriteria.map((ac: string) => `- ${ac}`)
      : ['- _(none recorded on the node)_']),
    '',
    "## Rationale (what worked, in the agent's own words)",
    '',
    rationale,
    '',
    '## Test files that exercised the change',
    '',
    ...testFiles.map((tf) => `- \`${tf}\``),
    '',
    '## How to apply',
    '',
    `When a future task carries any of these tags — ${tags.filter((t) => t !== 'experiential' && t !== 'case-based').join(', ') || '(none beyond experiential/case-based)'} — RAG should surface this memory so the agent can replay the working approach instead of rediscovering it.`,
    '',
  ].join('\n')

  return { shouldWrite: true, name, content }
}
