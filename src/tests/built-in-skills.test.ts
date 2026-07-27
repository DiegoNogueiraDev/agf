import { describe, it, expect } from 'vitest'
import { BUILT_IN_SKILLS, getBuiltInSkills, getSkillsByPhase, getSkillByName } from '../core/skills/built-in-skills.js'

describe('BUILT_IN_SKILLS', () => {
  it('is a non-empty readonly array', () => {
    expect(BUILT_IN_SKILLS.length).toBeGreaterThan(0)
  })

  it('each skill has name, description, category, phases, instructions', () => {
    for (const s of BUILT_IN_SKILLS.slice(0, 5)) {
      expect(typeof s.name).toBe('string')
      expect(typeof s.description).toBe('string')
      expect(typeof s.category).toBe('string')
      expect(Array.isArray(s.phases)).toBe(true)
      expect(typeof s.instructions).toBe('string')
    }
  })
})

describe('getBuiltInSkills', () => {
  it('returns same skills as BUILT_IN_SKILLS', () => {
    expect(getBuiltInSkills().length).toBe(BUILT_IN_SKILLS.length)
  })
})

describe('getSkillsByPhase', () => {
  it('returns skills for ANALYZE phase', () => {
    const skills = getSkillsByPhase('ANALYZE')
    expect(skills.length).toBeGreaterThan(0)
    for (const s of skills) {
      expect(s.phases).toContain('ANALYZE')
    }
  })

  it('returns empty for phase with no skills', () => {
    const skills = getSkillsByPhase('NONEXISTENT' as any)
    expect(skills).toHaveLength(0)
  })
})

describe('getSkillByName', () => {
  it('returns undefined for unknown name', () => {
    expect(getSkillByName('nonexistent-skill')).toBeUndefined()
  })

  it('returns the skill for a known name', () => {
    const name = BUILT_IN_SKILLS[0]!.name
    const skill = getSkillByName(name)
    expect(skill).toBeDefined()
    expect(skill?.name).toBe(name)
  })
})
