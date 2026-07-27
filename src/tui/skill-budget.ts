/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2025 OpenAI (OpenAI Codex)
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from OpenAI Codex (https://github.com/openai/codex), Apache-2.0.
 * See THIRD-PARTY-NOTICES.md.
 *
 * task-skill-budget-rendering — Budget-aware skill description truncation engine.
 *
 * Distributes a character budget across skills. Uses equal distribution per skill
 * so shorter descriptions are more likely to be fully preserved while longer ones
 * get truncated. Falls back to path aliases (r0/, r1/) when even names don't fit.
 */
import { createLogger } from '../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'tui/skill-budget.ts' })

export interface SkillBudgetEntry {
  name: string
  description: string
}

export interface TruncatedSkill {
  name: string
  description: string
  displayName: string
  displayDesc: string
}

export interface SkillBudgetResult {
  skills: TruncatedSkill[]
  truncated: boolean
  aliased: boolean
  budgetTotal: number
  budgetUsed: number
}

/**
 * Distributes a character budget across skills.
 *
 * 1. If total name length exceeds 60% of budget → alias fallback
 * 2. Equal distribution: each skill gets (budget - names) / numSkills chars for description
 * 3. Shorter descriptions naturally get fully preserved; longer ones get truncated
 */
export function budgetSkills(skills: SkillBudgetEntry[], charBudget: number): SkillBudgetResult {
  log.debug(`budgetSkills: ${skills.length} skills, ${charBudget} chars`)
  if (skills.length === 0) {
    return { skills: [], truncated: false, aliased: false, budgetTotal: charBudget, budgetUsed: 0 }
  }

  const totalNameLen = skills.reduce((sum, s) => sum + s.name.length, 0)

  if (totalNameLen > charBudget * 0.6) {
    return aliasMode(skills, charBudget)
  }

  return equalMode(skills, charBudget)
}

function aliasMode(skills: SkillBudgetEntry[], charBudget: number): SkillBudgetResult {
  const aliasPerSkill = 3
  const maxAliased = Math.floor(charBudget / aliasPerSkill)

  const result: TruncatedSkill[] = []
  let used = 0

  for (let i = 0; i < Math.min(skills.length, maxAliased); i++) {
    const alias = `r${i}/`
    result.push({
      name: skills[i].name,
      description: skills[i].description,
      displayName: alias,
      displayDesc: '',
    })
    used += alias.length
  }

  return {
    skills: result,
    truncated: true,
    aliased: true,
    budgetTotal: charBudget,
    budgetUsed: used,
  }
}

function equalMode(skills: SkillBudgetEntry[], charBudget: number): SkillBudgetResult {
  const namesBudget = skills.reduce((sum, s) => sum + s.name.length, 0)
  const budgetForDescs = charBudget - namesBudget
  const perSkill = budgetForDescs > 0 ? Math.floor(budgetForDescs / skills.length) : 0

  let used = namesBudget
  let anyTruncated = false
  const result: TruncatedSkill[] = []

  for (const s of skills) {
    const displayDesc = s.description.length <= perSkill ? s.description : s.description.slice(0, perSkill)

    if (displayDesc.length < s.description.length) anyTruncated = true
    used += displayDesc.length

    result.push({
      name: s.name,
      description: s.description,
      displayName: s.name,
      displayDesc,
    })
  }

  return {
    skills: result,
    truncated: anyTruncated,
    aliased: false,
    budgetTotal: charBudget,
    budgetUsed: Math.min(used, charBudget),
  }
}
