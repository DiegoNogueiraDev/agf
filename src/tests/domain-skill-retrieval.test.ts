import { describe, it, expect } from 'vitest'
import { findRelevantDomainSkills, formatDomainSkillsBlock } from '../core/skills/domain-skill-retrieval.js'

describe('findRelevantDomainSkills', () => {
  it('returns empty when no skills file exists at given rootDir', () => {
    const result = findRelevantDomainSkills('/nonexistent/path', 'test query')
    expect(result).toHaveLength(0)
  })

  it('returns empty for empty query', () => {
    const result = findRelevantDomainSkills('/nonexistent/path', '')
    expect(result).toHaveLength(0)
  })
})

describe('formatDomainSkillsBlock', () => {
  it('returns empty string for no matches', () => {
    expect(formatDomainSkillsBlock([])).toBe('')
  })

  it('returns formatted block for matches', () => {
    const match = {
      skill: { domain: 'testing', topic: 'unit-tests', triggers: ['test', 'unit'], confidence: 0.9 },
      score: 2,
      matchedTriggers: ['test'],
    }
    const block = formatDomainSkillsBlock([match])
    expect(block).toContain('testing/unit-tests')
    expect(block).toContain('0.9')
  })
})
