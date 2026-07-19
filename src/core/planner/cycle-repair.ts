/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-dynamic-replanning Task 1.2 — cycle-repair pure function.
 * Per ADR-0061: 2-node cycles → confidence="high" (auto-apply);
 * larger cycles → confidence="medium" (proposal for human review).
 * Edge heuristic: remove the most-recently-created edge in the cycle.
 */

import type { GraphDocument, GraphEdge } from '../graph/graph-types.js'
import { detectCycles } from './dependency-chain.js'
import { createLogger } from '../utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'planner/cycle-repair.ts' })

export interface CycleBreakProposal {
  cycle: string[]
  candidateEdge: GraphEdge
  justification: string
  confidence: 'high' | 'medium' | 'low'
}

export interface CycleRepairResult {
  cycles: string[][]
  action: 'none_needed' | 'proposals' | 'auto_applied' | 'mixed'
  proposals: CycleBreakProposal[]
  autoApplied: CycleBreakProposal[]
}

function normalizeCycle(cycle: string[]): string {
  // Canonical form: rotate so the lexicographically smallest node is first,
  // then serialize. This deduplicates equivalent cycles detected from
  // different DFS entry points.
  const nodes = cycle.slice(0, -1) // remove repeated last element
  let minIdx = 0
  for (let i = 1; i < nodes.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- §fix-ci-lint
    if (nodes[i]! < nodes[minIdx]!) minIdx = i
  }
  const rotated = [...nodes.slice(minIdx), ...nodes.slice(0, minIdx)]
  return rotated.join('\x00')
}

function findCandidateEdge(cycle: string[], edges: GraphEdge[]): GraphEdge | undefined {
  // Cycle: [A, B, C, A] → paths A→B, B→C, C→A
  const candidates: GraphEdge[] = []
  for (let i = 0; i < cycle.length - 1; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- §fix-ci-lint
    const from = cycle[i]!
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- §fix-ci-lint
    const to = cycle[i + 1]!
    for (const e of edges) {
      if (
        (e.relationType === 'depends_on' && e.from === from && e.to === to) ||
        (e.relationType === 'blocks' && e.from === to && e.to === from)
      ) {
        candidates.push(e)
      }
    }
  }
  if (candidates.length === 0) return undefined
  // Most recently created = highest createdAt ISO string
  return candidates.reduce((a, b) => (a.createdAt >= b.createdAt ? a : b))
}

export function repairCycles(doc: GraphDocument): CycleRepairResult {
  const rawCycles = detectCycles(doc)

  if (rawCycles.length === 0) {
    return { cycles: [], action: 'none_needed', proposals: [], autoApplied: [] }
  }

  // Deduplicate equivalent cycles
  const seen = new Set<string>()
  const uniqueCycles: string[][] = []
  for (const cycle of rawCycles) {
    const key = normalizeCycle(cycle)
    if (!seen.has(key)) {
      seen.add(key)
      uniqueCycles.push(cycle)
    }
  }

  const proposals: CycleBreakProposal[] = []
  const autoApplied: CycleBreakProposal[] = []

  for (const cycle of uniqueCycles) {
    const distinctNodes = cycle.length - 1 // last element = first repeated
    const candidate = findCandidateEdge(cycle, doc.edges)
    if (!candidate) continue

    const confidence: 'high' | 'medium' = distinctNodes === 2 ? 'high' : 'medium'
    const justification =
      confidence === 'high'
        ? `2-node cycle — deterministic removal of most-recent edge ${candidate.id} (${candidate.from}→${candidate.to})`
        : `${distinctNodes}-node cycle — removing most-recent edge ${candidate.id} (${candidate.from}→${candidate.to}) is the least-disruptive heuristic`

    const proposal: CycleBreakProposal = { cycle, candidateEdge: candidate, justification, confidence }

    if (confidence === 'high') {
      autoApplied.push(proposal)
    } else {
      proposals.push(proposal)
    }
  }

  let action: CycleRepairResult['action']
  if (proposals.length > 0 && autoApplied.length > 0) {
    action = 'mixed'
  } else if (autoApplied.length > 0) {
    action = 'auto_applied'
  } else {
    action = 'proposals'
  }

  return { cycles: uniqueCycles, action, proposals, autoApplied }
}
