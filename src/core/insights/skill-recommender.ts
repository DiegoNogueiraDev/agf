/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import path from 'node:path'
import { readdir, readFile } from 'node:fs/promises'
import type { GraphDocument } from '../graph/graph-types.js'
import type { LifecyclePhase } from '../planner/lifecycle-phase.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'skill-recommender.ts' })

export interface SkillInfo {
  name: string
  description: string
  category: string
  filePath: string
}

export interface SkillRecommendation {
  skill: string
  reason: string
  phase: string
}

/**
 * Scan skills directory for SKILL.md files and extract frontmatter.
 */
export async function scanSkills(basePath: string): Promise<SkillInfo[]> {
  const skillsDirs = [
    path.join(basePath, 'copilot-ecosystem', 'skills', 'agents'),
    path.join(basePath, '.claude', 'skills'),
  ]

  const skills: SkillInfo[] = []

  for (const dir of skillsDirs) {
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const skillMdPath = path.join(dir, entry.name, 'SKILL.md')
        try {
          const content = await readFile(skillMdPath, 'utf-8')
          const info = parseSkillFrontmatter(content, entry.name, skillMdPath)
          if (info) skills.push(info)
        } catch (err) {
          log.debug('intentional-swallow', { error: String(err), reason: 'no SKILL.md in this directory' })
        }
      }
    } catch (err) {
      log.debug('intentional-swallow', { error: String(err), reason: "directory doesn't exist" })
    }
  }

  log.info('Skills scanned', { count: skills.length })
  return skills
}

function parseSkillFrontmatter(content: string, dirName: string, filePath: string): SkillInfo | null {
  // Parse YAML frontmatter between --- delimiters
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) {
    return {
      name: dirName,
      description: extractFirstLine(content),
      category: 'general',
      filePath,
    }
  }

  const frontmatter = match[1]
  const name = extractField(frontmatter, 'name') ?? dirName
  const description = extractField(frontmatter, 'description') ?? extractFirstLine(content)
  const category = extractField(frontmatter, 'category') ?? 'general'

  return { name, description, category, filePath }
}

function extractField(yaml: string, field: string): string | null {
  // eslint-disable-next-line security/detect-non-literal-regexp -- field is always a hardcoded string literal from callers
  const match = yaml.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'))
  return match ? match[1].trim().replace(/^["']|["']$/g, '') : null
}

function extractFirstLine(content: string): string {
  const lines = content.split('\n').filter((l) => l.trim() && !l.startsWith('---') && !l.startsWith('#'))
  return lines[0]?.trim().substring(0, 120) ?? ''
}

/**
 * Generate skill recommendations based on current graph state.
 */
export function recommendSkills(doc: GraphDocument, availableSkills: SkillInfo[]): SkillRecommendation[] {
  const recommendations: SkillRecommendation[] = []
  // Bug #098: guard null/undefined availableSkills
  if (!availableSkills || availableSkills.length === 0) return recommendations
  const skillNames = new Set(availableSkills.map((s) => s.name))

  const tasksByStatus = new Map<string, number>()
  for (const node of doc.nodes) {
    if (node.type === 'task' || node.type === 'subtask') {
      const count = tasksByStatus.get(node.status) ?? 0
      tasksByStatus.set(node.status, count + 1)
    }
  }

  const inProgressCount = tasksByStatus.get('in_progress') ?? 0
  const backlogCount = tasksByStatus.get('backlog') ?? 0
  const blockedCount = tasksByStatus.get('blocked') ?? 0

  // Tasks without tests
  const tasksWithoutTests = doc.nodes.filter(
    (n) => (n.type === 'task' || n.type === 'subtask') && n.status === 'in_progress' && !n.tags?.includes('tested'),
  )
  if (tasksWithoutTests.length > 0 && skillNames.has('comprehensive-testing-reference')) {
    recommendations.push({
      skill: 'comprehensive-testing-reference',
      reason: `${tasksWithoutTests.length} tasks in progress without test coverage`,
      phase: 'IMPLEMENT',
    })
  }

  // Review pending
  const readyForReview = doc.nodes.filter(
    (n) => n.type === 'task' && n.status === 'in_progress' && n.tags?.includes('review-pending'),
  )
  if (readyForReview.length > 0 && skillNames.has('code-reviewer')) {
    recommendations.push({
      skill: 'code-reviewer',
      reason: `${readyForReview.length} tasks pending review`,
      phase: 'REVIEW',
    })
  }

  // High blocked count
  if (blockedCount > 3) {
    recommendations.push({
      skill: 'breakdown-feature-prd',
      reason: `${blockedCount} blocked tasks — consider re-planning dependencies`,
      phase: 'ANALYZE',
    })
  }

  // Large backlog
  if (backlogCount > 20 && inProgressCount === 0) {
    recommendations.push({
      skill: 'breakdown-feature-prd',
      reason: `${backlogCount} tasks in backlog with none in progress — start sprint planning`,
      phase: 'PLAN',
    })
  }

  // Missing acceptance criteria
  const missingAC = doc.nodes.filter(
    (n) =>
      (n.type === 'task' || n.type === 'epic') &&
      n.status !== 'done' &&
      (!n.acceptanceCriteria || n.acceptanceCriteria.length === 0),
  )
  if (missingAC.length > 5) {
    recommendations.push({
      skill: 'create-prd-chat-mode',
      reason: `${missingAC.length} tasks/epics without acceptance criteria`,
      phase: 'DESIGN',
    })
  }

  log.info('Skill recommendations generated', { count: recommendations.length })
  return recommendations
}

/**
 * Generate skill recommendations using built-in skills based on graph state and current phase.
 * Unlike recommendSkills() which requires filesystem scan, this works directly with built-in skills.
 */
export function recommendBuiltInSkills(doc: GraphDocument, phase: LifecyclePhase): SkillRecommendation[] {
  const recommendations: SkillRecommendation[] = []

  const tasks = doc.nodes.filter((n) => n.type === 'task' || n.type === 'subtask')
  const epics = doc.nodes.filter((n) => n.type === 'epic')

  const inProgressTasks = tasks.filter((n) => n.status === 'in_progress')
  const doneTasks = tasks.filter((n) => n.status === 'done')
  const blockedTasks = tasks.filter((n) => n.status === 'blocked')

  const tasksWithoutAC = [...tasks, ...epics].filter(
    (n) => n.status !== 'done' && (!n.acceptanceCriteria || n.acceptanceCriteria.length === 0),
  )

  const untestedInProgress = inProgressTasks.filter((n) => !n.tags?.includes('tested'))

  switch (phase) {
    case 'ANALYZE': {
      if (epics.length === 0 && tasks.length === 0) {
        recommendations.push({
          skill: 'create-prd-chat-mode',
          reason: 'No epics or tasks in graph — start with a PRD',
          phase: 'ANALYZE',
        })
      }
      if (tasksWithoutAC.length > 5) {
        recommendations.push({
          skill: 'business-analyst',
          reason: `${tasksWithoutAC.length} tasks/epics without acceptance criteria`,
          phase: 'ANALYZE',
        })
      }
      break
    }
    case 'DESIGN': {
      if (doc.edges.length === 0 && doc.nodes.length > 1) {
        recommendations.push({
          skill: 'context-architect',
          reason: 'No edges between nodes — define module dependencies',
          phase: 'DESIGN',
        })
      }
      if (epics.length > 0) {
        recommendations.push({
          skill: 'breakdown-epic-arch',
          reason: 'Epics detected — decompose into architectural components',
          phase: 'DESIGN',
        })
      }
      break
    }
    case 'PLAN': {
      const unassigned = tasks.filter((n) => !n.tags?.includes('sprint'))
      if (unassigned.length > 0) {
        recommendations.push({
          skill: 'breakdown-feature-prd',
          reason: `${unassigned.length} tasks without sprint assignment`,
          phase: 'PLAN',
        })
      }
      if (doc.edges.length === 0 && tasks.length > 1) {
        recommendations.push({
          skill: 'track-with-mcp-graph',
          reason: 'No dependency edges — sync graph with real dependencies',
          phase: 'PLAN',
        })
      }
      break
    }
    case 'IMPLEMENT': {
      if (untestedInProgress.length > 0) {
        recommendations.push({
          skill: 'comprehensive-testing-reference',
          reason: `${untestedInProgress.length} in-progress tasks without test coverage`,
          phase: 'IMPLEMENT',
        })
      }
      if (inProgressTasks.length >= 3) {
        recommendations.push({
          skill: 'subagent-driven-development',
          reason: `${inProgressTasks.length} tasks in parallel — delegate to sub-agents`,
          phase: 'IMPLEMENT',
        })
      }
      if (blockedTasks.length > 3) {
        recommendations.push({
          skill: 'self-healing-awareness',
          reason: `${blockedTasks.length} blocked tasks — check healing memories for known patterns`,
          phase: 'IMPLEMENT',
        })
      }
      break
    }
    case 'VALIDATE': {
      const doneWithoutValidation = doneTasks.filter((n) => !n.tags?.includes('validated'))
      if (doneWithoutValidation.length > 0) {
        recommendations.push({
          skill: 'playwright-generate-test',
          reason: `${doneWithoutValidation.length} done tasks without validation`,
          phase: 'VALIDATE',
        })
      }
      if (tasksWithoutAC.length > 0) {
        recommendations.push({
          skill: 'e2e-testing',
          reason: `${tasksWithoutAC.length} tasks missing AC — cannot validate without criteria`,
          phase: 'VALIDATE',
        })
      }
      break
    }
    case 'REVIEW': {
      const reviewPending = tasks.filter((n) => n.tags?.includes('review-pending'))
      if (reviewPending.length > 0) {
        recommendations.push({
          skill: 'code-reviewer',
          reason: `${reviewPending.length} tasks pending review`,
          phase: 'REVIEW',
        })
      }
      if (doneTasks.length > 0) {
        recommendations.push({
          skill: 'log-standardization-framework',
          reason: 'Verify log standardization across completed tasks',
          phase: 'REVIEW',
        })
      }
      break
    }
    case 'DEPLOY': {
      if (tasks.length > 0 && tasks.every((n) => n.status === 'done')) {
        recommendations.push({
          skill: 'deployment-engineer',
          reason: 'All tasks done — validate CI pipeline and prepare release',
          phase: 'DEPLOY',
        })
      }
      recommendations.push({
        skill: 'devops-deploy',
        reason: 'Verify environment parity and deploy strategy',
        phase: 'DEPLOY',
      })
      break
    }
    case 'HANDOFF': {
      recommendations.push({
        skill: 'delivery-checklist',
        reason: 'Execute delivery checklist before handoff',
        phase: 'HANDOFF',
      })
      recommendations.push({
        skill: 'knowledge-capture',
        reason: 'Capture technical decisions and lessons learned',
        phase: 'HANDOFF',
      })
      break
    }
    case 'LISTENING': {
      recommendations.push({
        skill: 'feedback-collector',
        reason: 'Collect and classify feedback as graph nodes',
        phase: 'LISTENING',
      })
      if (doneTasks.length > 0) {
        recommendations.push({
          skill: 'metrics-retrospective',
          reason: 'Review velocity and burndown from completed sprint',
          phase: 'LISTENING',
        })
      }
      break
    }
  }

  const capped = recommendations.slice(0, 5)
  log.info('Built-in skill recommendations generated', { phase, count: capped.length })
  return capped
}
