/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Auto-Skill Proposer — generates a draft skill markdown from a finished task's
 * trajectory. Never writes to disk; returns the draft for human review.
 */

export interface ProposeSkillInput {
  taskId: string
  taskTitle: string
  taskDescription: string
  summary: string
  reasons: string[]
  discoveredAt?: string
}

export interface SkillProposal {
  draft: string
  domain: string
  topic: string
  confidence: number
}

interface DomainRule {
  domain: string
  patterns: RegExp[]
}

const DOMAIN_RULES: DomainRule[] = [
  { domain: 'sqlite-perf', patterns: [/\bsqlite\b/i, /\bbetter-sqlite3\b/i] },
  { domain: 'mcp-tools', patterns: [/\bmcp\b/i, /\btool wrapper\b/i] },
  { domain: 'rag', patterns: [/\brag\b/i, /\bembedding\b/i, /\bretrieval\b/i] },
  { domain: 'react-ui', patterns: [/\breact\b/i, /\bjsx\b/i, /\btsx\b/i, /\btailwind\b/i] },
  { domain: 'http-api', patterns: [/\bhttp\b/i, /\bexpress\b/i, /\brouter\b/i, /\brest\b/i] },
  { domain: 'parser', patterns: [/\bparser\b/i, /\bast\b/i, /\btokenizer\b/i] },
  { domain: 'testing', patterns: [/\bvitest\b/i, /\bplaywright\b/i] },
  { domain: 'graph', patterns: [/\bgraph store\b/i, /\bnode\b.*\bedge\b/i] },
]

function inferDomain(title: string, description: string): string {
  const haystack = `${title} ${description}`
  for (const rule of DOMAIN_RULES) {
    if (rule.patterns.some((p) => p.test(haystack))) {
      return rule.domain
    }
  }
  return 'general'
}

function inferTopic(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join('-')
  return slug || 'untitled'
}

function computeConfidence(reasons: string[]): number {
  const score = 0.4 + 0.15 * reasons.length
  return Math.min(0.9, Math.round(score * 100) / 100)
}

/** proposeSkillFromTrajectory —  */
export function proposeSkillFromTrajectory(input: ProposeSkillInput): SkillProposal {
  const domain = inferDomain(input.taskTitle, input.taskDescription)
  const topic = inferTopic(input.taskTitle)
  const confidence = computeConfidence(input.reasons)
  const discoveredAt = input.discoveredAt ?? new Date().toISOString()
  const triggers = input.reasons.length > 0 ? `[${input.reasons.join(', ')}]` : '[]'

  const draft = `---
name: auto-${domain}-${topic}
domain: ${domain}
topic: ${topic}
triggers: ${triggers}
discovered_at: ${discoveredAt}
source_task: ${input.taskId}
confidence: ${confidence}
status: draft
---

# Auto-Proposed Skill: ${input.taskTitle}

This skill was auto-proposed from task \`${input.taskId}\` based on trajectory
heuristics: ${input.reasons.join(', ') || '(none)'}.

## Summary

${input.summary}

## Source Task

- **Title:** ${input.taskTitle}
- **Description:** ${input.taskDescription}

## Review

This is a draft. Edit, accept, or discard before persisting as a real skill.
`

  return { draft, domain, topic, confidence }
}
