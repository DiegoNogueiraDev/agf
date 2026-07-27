import { describe, it, expect, beforeEach } from 'vitest'
import { SkillRegistry } from '../tui/skill-registry.js'
import type { SlashCommandSkill } from '../tui/skill-handler-port.js'

function makeSkill(name: string, phase?: string): SlashCommandSkill {
  return {
    name,
    usage: `/${name}`,
    desc: `${name} description`,
    phase,
    handle: async () => `${name} result`,
  }
}

describe('SkillRegistry', () => {
  let registry: SkillRegistry

  beforeEach(() => {
    registry = new SkillRegistry()
  })

  it('starts empty', () => {
    expect(registry.getAll()).toHaveLength(0)
  })

  it('registers a skill', () => {
    registry.register(makeSkill('my-skill'))
    expect(registry.getAll()).toHaveLength(1)
  })

  it('find returns the registered skill by name', () => {
    registry.register(makeSkill('greet'))
    const found = registry.find('greet')
    expect(found).toBeDefined()
    expect(found?.name).toBe('greet')
  })

  it('find returns undefined for unknown name', () => {
    expect(registry.find('nonexistent')).toBeUndefined()
  })

  it('listByPhase returns skills in the given phase', () => {
    registry.register(makeSkill('analyze-prd', 'ANALYZE'))
    registry.register(makeSkill('design-arch', 'DESIGN'))
    registry.register(makeSkill('analyze-code', 'ANALYZE'))
    const analyzeSkills = registry.listByPhase('ANALYZE')
    expect(analyzeSkills).toHaveLength(2)
    expect(analyzeSkills.every((s) => s.phase === 'ANALYZE')).toBe(true)
  })

  it('listByPhase returns skills sorted by name', () => {
    registry.register(makeSkill('z-skill', 'IMPLEMENT'))
    registry.register(makeSkill('a-skill', 'IMPLEMENT'))
    const skills = registry.listByPhase('IMPLEMENT')
    expect(skills[0].name).toBe('a-skill')
    expect(skills[1].name).toBe('z-skill')
  })

  it('listByPhase returns empty when no skills in phase', () => {
    registry.register(makeSkill('some-skill', 'ANALYZE'))
    expect(registry.listByPhase('DEPLOY')).toHaveLength(0)
  })

  it('getNext returns skill in next lifecycle phase', () => {
    registry.register(makeSkill('plan-task', 'PLAN'))
    const next = registry.getNext('DESIGN')
    expect(next).toBeDefined()
    expect(next?.phase).toBe('PLAN')
  })

  it('getNext returns undefined for last phase', () => {
    expect(registry.getNext('LISTENING')).toBeUndefined()
  })

  it('getNext returns undefined for unknown phase', () => {
    expect(registry.getNext('UNKNOWN_PHASE')).toBeUndefined()
  })

  it('getAll returns all registered skills', () => {
    registry.register(makeSkill('a'))
    registry.register(makeSkill('b'))
    registry.register(makeSkill('c'))
    expect(registry.getAll()).toHaveLength(3)
  })
})
