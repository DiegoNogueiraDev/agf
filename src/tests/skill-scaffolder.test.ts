import { describe, it, expect } from 'vitest'
import {
  isValidSkillName,
  isValidCategory,
  buildSkillTemplate,
  SKILL_CATEGORIES,
} from '../core/skills/skill-scaffolder.js'
import type { ScaffoldInput } from '../core/skills/skill-scaffolder.js'

describe('isValidSkillName', () => {
  it('accepts valid lowercase hyphenated name', () => {
    expect(isValidSkillName('my-skill')).toBe(true)
  })

  it('accepts single-word name', () => {
    expect(isValidSkillName('analyze')).toBe(true)
  })

  it('accepts name with numbers', () => {
    expect(isValidSkillName('skill-v2')).toBe(true)
  })

  it('rejects name starting with uppercase', () => {
    expect(isValidSkillName('MySkill')).toBe(false)
  })

  it('rejects name with spaces', () => {
    expect(isValidSkillName('my skill')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isValidSkillName('')).toBe(false)
  })

  it('rejects name with underscores', () => {
    expect(isValidSkillName('my_skill')).toBe(false)
  })

  it('rejects single character (too short)', () => {
    expect(isValidSkillName('a')).toBe(false)
  })
})

describe('isValidCategory', () => {
  it('accepts all valid categories', () => {
    for (const cat of SKILL_CATEGORIES) {
      expect(isValidCategory(cat)).toBe(true)
    }
  })

  it('rejects unknown category', () => {
    expect(isValidCategory('unknown')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isValidCategory('')).toBe(false)
  })
})

describe('buildSkillTemplate', () => {
  const input: ScaffoldInput = {
    name: 'my-skill',
    category: 'implement',
    description: 'Test skill',
    phases: ['IMPLEMENT'],
  }

  it('returns a non-empty string', () => {
    expect(typeof buildSkillTemplate(input)).toBe('string')
    expect(buildSkillTemplate(input).length).toBeGreaterThan(0)
  })

  it('includes frontmatter with name', () => {
    const result = buildSkillTemplate(input)
    expect(result).toContain('name: my-skill')
  })

  it('includes category in frontmatter', () => {
    const result = buildSkillTemplate(input)
    expect(result).toContain('category: implement')
  })

  it('includes description in frontmatter', () => {
    const result = buildSkillTemplate(input)
    expect(result).toContain('description: Test skill')
  })

  it('includes phases in frontmatter', () => {
    const result = buildSkillTemplate(input)
    expect(result).toContain('phases: [IMPLEMENT]')
  })

  it('includes skill name as heading', () => {
    const result = buildSkillTemplate(input)
    expect(result).toContain('# my-skill')
  })

  it('defaults to IMPLEMENT phase when phases not provided', () => {
    const result = buildSkillTemplate({ name: 'test-skill', category: 'analyze' })
    expect(result).toContain('phases: [IMPLEMENT]')
  })

  it('uses default description when none provided', () => {
    const result = buildSkillTemplate({ name: 'my-skill', category: 'review' })
    expect(result).toContain('my-skill skill')
  })
})
