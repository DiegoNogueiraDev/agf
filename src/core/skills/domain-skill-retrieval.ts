/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Domain Skill Retrieval — token-based matching of a query against domain
 * skill triggers. A trigger token contributes 1.0 to the score for every
 * occurrence in the query; the domain name contributes 0.5 to break ties.
 * Results are sorted by score descending, then by confidence descending.
 *
 * Pure / file-system only. No SQLite, no embeddings — keeps start_task fast.
 */

import { loadDomainSkills, type DomainSkill } from './domain-skill-loader.js'

export interface DomainSkillMatch {
  skill: DomainSkill
  score: number
  matchedTriggers: string[]
}

export interface RetrievalOptions {
  limit?: number
  minScore?: number
}

const TOKEN_RE = /[a-z0-9]+/g

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(TOKEN_RE) ?? []).filter((t) => t.length > 1)
}

function scoreSkill(skill: DomainSkill, queryTokens: Set<string>): { score: number; matched: string[] } {
  const matched = new Set<string>()
  let score = 0

  for (const trigger of skill.triggers) {
    const triggerTokens = tokenize(trigger)
    let triggerMatched = false
    for (const tok of triggerTokens) {
      if (queryTokens.has(tok)) {
        score += 1
        triggerMatched = true
      }
    }
    if (triggerMatched) matched.add(trigger)
  }

  for (const domainTok of tokenize(skill.domain)) {
    if (queryTokens.has(domainTok)) score += 0.5
  }

  return { score, matched: [...matched] }
}

/** findRelevantDomainSkills —  */
export function findRelevantDomainSkills(
  rootDir: string,
  query: string,
  options: RetrievalOptions = {},
): DomainSkillMatch[] {
  const { skills } = loadDomainSkills(rootDir)
  if (skills.length === 0) return []

  const queryTokens = new Set(tokenize(query))
  if (queryTokens.size === 0) return []

  const minScore = options.minScore ?? 0.5
  const matches: DomainSkillMatch[] = []

  for (const skill of skills) {
    const { score, matched } = scoreSkill(skill, queryTokens)
    if (score >= minScore) {
      matches.push({ skill, score, matchedTriggers: matched })
    }
  }

  matches.sort((a, b) => b.score - a.score || b.skill.confidence - a.skill.confidence)

  return options.limit !== undefined ? matches.slice(0, options.limit) : matches
}

/** formatDomainSkillsBlock —  */
export function formatDomainSkillsBlock(matches: DomainSkillMatch[]): string {
  if (matches.length === 0) return ''

  const lines = ['Domain skills relevantes:']
  for (const mVar of matches) {
    const triggers = mVar.matchedTriggers.length > 0 ? ` [${mVar.matchedTriggers.join(', ')}]` : ''
    lines.push(`  - ${mVar.skill.domain}/${mVar.skill.topic}${triggers} (confidence ${mVar.skill.confidence})`)
  }
  return lines.join('\n')
}
