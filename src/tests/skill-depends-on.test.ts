/*!
 * TDD: dependsOn enforcement in SkillRegistry (node_b10d0cc12f9e).
 *
 * AC1: Skill with unmet dependsOn → checkDependsOn returns missing dep name.
 * AC2: All deps met → checkDependsOn returns null.
 */

import { describe, it, expect } from 'vitest'
import { SkillRegistry } from '../tui/skill-registry.js'

function makeRegistry(): SkillRegistry {
  const r = new SkillRegistry()
  r.register({ name: 'base-skill', usage: '/base-skill', desc: 'Base', phase: 'ANALYZE' })
  r.register({
    name: 'child-skill',
    usage: '/child-skill',
    desc: 'Requires base',
    phase: 'IMPLEMENT',
    dependsOn: ['base-skill'],
  })
  r.register({
    name: 'orphan-skill',
    usage: '/orphan-skill',
    desc: 'Requires missing skill',
    phase: 'IMPLEMENT',
    dependsOn: ['nonexistent-skill'],
  })
  return r
}

describe('AC1: unmet dependsOn returns the missing dep name', () => {
  it('returns null when skill has no dependsOn', () => {
    const r = makeRegistry()
    expect(r.checkDependsOn('base-skill')).toBe(null)
  })

  it('returns the missing dep name when dep is not registered', () => {
    const r = makeRegistry()
    expect(r.checkDependsOn('orphan-skill')).toBe('nonexistent-skill')
  })
})

describe('AC2: all deps met → null', () => {
  it('returns null when all dependsOn are registered', () => {
    const r = makeRegistry()
    expect(r.checkDependsOn('child-skill')).toBe(null)
  })

  it('returns null for unknown skill (no deps to check)', () => {
    const r = makeRegistry()
    expect(r.checkDependsOn('unknown')).toBe(null)
  })
})
