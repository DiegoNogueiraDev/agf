/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Generates a narrative markdown summary from a TaskContext (zero LLM calls).
 * WHY: isolated from assembly so the summary format can evolve without touching
 * the builders. Composing: compact-context-types.ts (TaskContext, TaskSummary).
 */

import type { TaskContext, TaskSummary } from './compact-context-types.js'
import { estimateTokens } from './token-estimator.js'
import type { Scenario } from '../evals/scenario-runner.js'

export interface ScenarioCard {
  id: string
  tier: string
  tags: string[] | undefined
  testCmd: string
  tokenBudget: number | undefined
  /** <=3-sentence objective derived from the prd. */
  objective: string
}

export interface DistillScenarioCardResult {
  card: ScenarioCard
  tokensBefore: number
  tokensAfter: number
}

const MAX_OBJECTIVE_SENTENCES = 3

/**
 * Distils a Scenario into a compact ScenarioCard for context-efficient passing.
 * Extracts id/tier/tags/testCmd/tokenBudget and truncates the prd to at most
 * MAX_OBJECTIVE_SENTENCES sentences as the objective. Zero LLM calls.
 */
export function distillScenarioCard(scenario: Scenario): DistillScenarioCardResult {
  const tokensBefore = estimateTokens(scenario.prd)

  // Extract up to 3 sentences from the prd as the objective.
  const sentences = scenario.prd
    .replace(/\r\n/g, '\n')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const objective = sentences.slice(0, MAX_OBJECTIVE_SENTENCES).join(' ')

  const tokensAfter = estimateTokens(JSON.stringify({ id: scenario.id, tier: scenario.tier, objective }))

  return {
    card: {
      id: scenario.id,
      tier: scenario.tier,
      tags: scenario.tags,
      testCmd: scenario.testCmd,
      tokenBudget: scenario.tokenBudget,
      objective,
    },
    tokensBefore,
    tokensAfter,
  }
}

export type SummaryFormat = 'markdown'

/**
 * Gera um sumário narrativo a partir de um TaskContext.
 * Determinístico — zero LLM calls, usa template ancorado com 5 seções.
 */
export function summarizeTaskContext(ctx: TaskContext, _format: SummaryFormat = 'markdown'): string {
  const lines: string[] = []

  // ── Goal ──
  lines.push('## Goal')
  lines.push('')
  lines.push(`**${ctx.task.title}**`)
  if (ctx.task.description) {
    lines.push('')
    lines.push(ctx.task.description)
  }
  if (ctx.acceptanceCriteria.length > 0) {
    lines.push('')
    for (const ac of ctx.acceptanceCriteria) {
      lines.push(`- ${ac}`)
    }
  }

  // ── Progress ──
  lines.push('')
  lines.push('## Progress')
  lines.push('')
  if (ctx.children.length === 0) {
    lines.push('No children — task is atomic.')
  } else {
    const done: TaskSummary[] = []
    const inProgress: TaskSummary[] = []
    const ready: TaskSummary[] = []
    const blocked: TaskSummary[] = []
    const backlog: TaskSummary[] = []
    for (const c of ctx.children) {
      if (c.status === 'done') done.push(c)
      else if (c.status === 'in_progress' || c.status === 'active') inProgress.push(c)
      else if (c.status === 'blocked') blocked.push(c)
      else if (c.status === 'ready') ready.push(c)
      else backlog.push(c)
    }

    const groups: [string, TaskSummary[]][] = [
      ['Done', done],
      ['In Progress', inProgress],
      ['Ready', ready],
      ['Blocked', blocked],
      ['Backlog', backlog],
    ]
    for (const [label, items] of groups) {
      if (items.length > 0) {
        for (const item of items) {
          lines.push(`- **${label}:** ${item.title} (${item.id})`)
        }
      }
    }
  }

  // ── Blockers ──
  lines.push('')
  lines.push('## Blockers')
  lines.push('')
  if (ctx.blockers.length === 0) {
    lines.push('None')
  } else {
    for (const b of ctx.blockers) {
      const inferredTag = b.inferred ? ' (inferred)' : ''
      lines.push(`- ${b.title} (${b.status})${inferredTag}`)
    }
  }

  // ── Dependencies ──
  lines.push('')
  lines.push('## Dependencies')
  lines.push('')
  if (ctx.dependsOn.length === 0) {
    lines.push('None')
  } else {
    for (const d of ctx.dependsOn) {
      const resolvedTag = d.resolved ? ' ✓' : ''
      lines.push(`- ${d.title} (${d.status})${resolvedTag}`)
    }
  }

  // ── Next Steps ──
  lines.push('')
  lines.push('## Next Steps')
  lines.push('')
  const nextItems: string[] = []
  for (const c of ctx.children) {
    if (c.status === 'ready' || c.status === 'pending') {
      nextItems.push(c.title)
    }
  }
  if (nextItems.length === 0) {
    lines.push('No pending work items.')
  } else {
    for (const item of nextItems) {
      lines.push(`- ${item}`)
    }
  }

  return lines.join('\n')
}
