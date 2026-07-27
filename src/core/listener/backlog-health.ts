/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Backlog Health — analyzes backlog state for new cycle readiness.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { BacklogHealthReport } from '../../schemas/listener-schema.js'
import { TASK_TYPES } from '../utils/node-type-sets.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'backlog-health.ts' })
/** Simple string keywords matched via `.includes()` */
const TECH_DEBT_SIMPLE_KEYWORDS = ['tech-debt', 'refactor', 'debt', 'cleanup', 'deprecat']

/**
 * Regex-based keyword for "fix" — uses word boundaries to avoid false positives
 * with Portuguese words like "fixo", "fixar", "fixação" and English adjectives
 * like "fixed timestep". Matches: fix, fixes, fixing, hotfix, bugfix.
 */
const FIX_PATTERN = /\b(?:hot|bug)?fix(?:es|ing)?\b/i
const STALE_THRESHOLD_DAYS = 30

/** Analyze backlog state, stale tasks, and tech debt indicators. */
export function analyzeBacklogHealth(doc: GraphDocument): BacklogHealthReport {
  // Bug #072: include epics and requirements in backlog analysis, not just tasks
  const BACKLOG_TYPES = new Set([...TASK_TYPES, 'epic', 'requirement'])
  const tasks = doc.nodes.filter((n) => BACKLOG_TYPES.has(n.type))
  const backlogTasks = tasks.filter((n) => n.status === 'backlog')
  const readyTasks = tasks.filter((n) => n.status === 'ready')

  const now = Date.now()

  // Find stale tasks (in backlog/ready for more than 30 days)
  const staleTasks = [...backlogTasks, ...readyTasks]
    .filter((t) => {
      const createdMs = new Date(t.createdAt).getTime()
      const daysOld = (now - createdMs) / (1000 * 60 * 60 * 24)
      return daysOld >= STALE_THRESHOLD_DAYS
    })
    .map((t) => ({
      nodeId: t.id,
      title: t.title,
      daysInBacklog: Math.floor((now - new Date(t.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
    }))

  // Find tech debt indicators by tags/title/description keywords
  const techDebtIndicators = doc.nodes
    .filter((n) => {
      const searchText = [
        n.title.toLowerCase(),
        (n.description ?? '').toLowerCase(),
        ...(n.tags ?? []).map((t) => t.toLowerCase()),
      ].join(' ')
      const hasSimple = TECH_DEBT_SIMPLE_KEYWORDS.some((kw) => searchText.includes(kw))
      const hasFix = FIX_PATTERN.test(searchText)
      return hasSimple || hasFix
    })
    .map((n) => {
      const searchText = [
        n.title.toLowerCase(),
        (n.description ?? '').toLowerCase(),
        ...(n.tags ?? []).map((t) => t.toLowerCase()),
      ].join(' ')
      const matchedKeywords = TECH_DEBT_SIMPLE_KEYWORDS.filter((kw) => searchText.includes(kw))
      if (FIX_PATTERN.test(searchText)) {
        matchedKeywords.push('fix')
      }
      return {
        nodeId: n.id,
        title: n.title,
        keywords: matchedKeywords,
      }
    })

  // Aging statistics
  const agingDays = [...backlogTasks, ...readyTasks].map((t) => {
    const created = new Date(t.createdAt).getTime()
    return Math.floor((now - created) / (1000 * 60 * 60 * 24))
  })
  const avgDays = agingDays.length > 0 ? Math.round(agingDays.reduce((a, b) => a + b, 0) / agingDays.length) : 0
  const maxDays = agingDays.length > 0 ? Math.max(...agingDays) : 0

  // Clean for new cycle = no stale tasks, limited tech debt, and reasonable backlog size
  const cleanForNewCycle = staleTasks.length === 0 && techDebtIndicators.length <= 3 && backlogTasks.length <= 50

  // Type and priority distribution (backlog + ready tasks only)
  const activePool = [...backlogTasks, ...readyTasks]
  const typeDistribution: Record<string, number> = {}
  const priorityDistribution: Record<string, number> = {}
  for (const tVar of activePool) {
    typeDistribution[tVar.type] = (typeDistribution[tVar.type] ?? 0) + 1
    const pKey = String(tVar.priority)
    priorityDistribution[pKey] = (priorityDistribution[pKey] ?? 0) + 1
  }

  log.info('backlog-health', {
    backlogCount: backlogTasks.length,
    readyCount: readyTasks.length,
    staleCount: staleTasks.length,
    techDebtCount: techDebtIndicators.length,
  })

  return {
    backlogCount: backlogTasks.length,
    readyCount: readyTasks.length,
    staleTasks,
    techDebtIndicators,
    cleanForNewCycle,
    typeDistribution,
    priorityDistribution,
    aging: { avgDays, maxDays },
  }
}
