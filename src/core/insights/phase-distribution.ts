/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type { GraphDocument } from '../graph/graph-types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'phase-distribution.ts' })

const LIFECYCLE_PHASES = [
  'ANALYZE',
  'DESIGN',
  'PLAN',
  'IMPLEMENT',
  'VALIDATE',
  'REVIEW',
  'HANDOFF',
  'DEPLOY',
  'LISTENING',
] as const

type Phase = (typeof LIFECYCLE_PHASES)[number]

const PHASE_COLORS: Record<Phase, string> = {
  ANALYZE: '#8b5cf6',
  DESIGN: '#3b82f6',
  PLAN: '#06b6d4',
  IMPLEMENT: '#10b981',
  VALIDATE: '#f59e0b',
  REVIEW: '#ef4444',
  HANDOFF: '#ec4899',
  DEPLOY: '#f97316',
  LISTENING: '#6b7280',
}

/** Tag-to-phase mapping for heuristic classification */
const TAG_PHASE_MAP: Record<string, Phase> = {
  analyze: 'ANALYZE',
  analysis: 'ANALYZE',
  prd: 'ANALYZE',
  requirement: 'ANALYZE',
  requirements: 'ANALYZE',
  design: 'DESIGN',
  architecture: 'DESIGN',
  adr: 'DESIGN',
  interface: 'DESIGN',
  plan: 'PLAN',
  planning: 'PLAN',
  sprint: 'PLAN',
  decompose: 'PLAN',
  implement: 'IMPLEMENT',
  implementation: 'IMPLEMENT',
  code: 'IMPLEMENT',
  tdd: 'IMPLEMENT',
  coding: 'IMPLEMENT',
  validate: 'VALIDATE',
  validation: 'VALIDATE',
  test: 'VALIDATE',
  testing: 'VALIDATE',
  e2e: 'VALIDATE',
  qa: 'VALIDATE',
  review: 'REVIEW',
  'code-review': 'REVIEW',
  handoff: 'HANDOFF',
  delivery: 'HANDOFF',
  pr: 'HANDOFF',
  documentation: 'HANDOFF',
  deploy: 'DEPLOY',
  release: 'DEPLOY',
  ci: 'DEPLOY',
  cd: 'DEPLOY',
  pipeline: 'DEPLOY',
  listening: 'LISTENING',
  feedback: 'LISTENING',
}

/** Status-based fallback heuristic */
const STATUS_PHASE_MAP: Record<string, Phase> = {
  backlog: 'PLAN',
  ready: 'PLAN',
  in_progress: 'IMPLEMENT',
  blocked: 'IMPLEMENT',
  done: 'IMPLEMENT',
}

export interface PhaseDistribution {
  phase: string
  taskCount: number
  percentage: number
  color: string
}

/**
 * Calculate lifecycle phase distribution from the execution graph.
 *
 * Classification priority:
 * 1. Explicit `metadata.phase` field
 * 2. Tag-based heuristic (maps common tags to phases)
 * 3. Status-based fallback
 */
export function calculatePhaseDistribution(doc: GraphDocument): PhaseDistribution[] {
  log.info('Calculating phase distribution', { nodes: doc.nodes.length })

  const tasks = doc.nodes.filter((n) => n.type === 'task' || n.type === 'subtask')
  const phaseCounts = new Map<Phase, number>()
  for (const phase of LIFECYCLE_PHASES) phaseCounts.set(phase, 0)

  for (const task of tasks) {
    const phase = classifyTaskPhase(task)
    phaseCounts.set(phase, (phaseCounts.get(phase) ?? 0) + 1)
  }

  const totalTasks = tasks.length

  return LIFECYCLE_PHASES.map((phase) => {
    const taskCount = phaseCounts.get(phase) ?? 0
    return {
      phase,
      taskCount,
      percentage: totalTasks > 0 ? Math.round((taskCount / totalTasks) * 100) : 0,
      color: PHASE_COLORS[phase],
    }
  })
}

function classifyTaskPhase(node: { metadata?: Record<string, unknown>; tags?: string[]; status: string }): Phase {
  // Priority 1: Explicit metadata.phase
  const metaPhase = node.metadata?.phase
  if (typeof metaPhase === 'string') {
    const upper = metaPhase.toUpperCase() as Phase
    if (LIFECYCLE_PHASES.includes(upper)) return upper
  }

  // Priority 2: Tag-based heuristic
  if (node.tags && node.tags.length > 0) {
    for (const tag of node.tags) {
      const mapped = TAG_PHASE_MAP[tag.toLowerCase()]
      if (mapped) return mapped
    }
  }

  // Priority 3: Status-based fallback
  return STATUS_PHASE_MAP[node.status] ?? 'IMPLEMENT'
}
