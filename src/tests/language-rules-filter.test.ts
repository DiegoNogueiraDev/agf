/*!
 * TDD: per-language rules filter — load only active stack (node_47db0e20e312).
 *
 * AC1: Go project does NOT receive TS rules; receives Go rules.
 * AC2: Multi-stack project loads rules for each detected stack.
 */

import { describe, it, expect } from 'vitest'
import { filterRulesByStack, type RulePack } from '../core/config/language-rules-filter.js'

const ALL_PACKS: RulePack[] = [
  { id: 'typescript', languages: ['typescript', 'javascript'], content: 'TS rules: strict mode, no any.' },
  { id: 'golang', languages: ['go'], content: 'Go rules: use idiomatic Go error handling.' },
  { id: 'python', languages: ['python'], content: 'Python rules: PEP 8, type hints.' },
  { id: 'common', languages: [], content: 'Common rules: TDD, clean code.' }, // no language filter = always included
]

describe('AC1: Go project excludes TS rules', () => {
  it('returns golang pack and common but not typescript or python', () => {
    const active = filterRulesByStack(['go'], ALL_PACKS)
    const ids = active.map((p) => p.id)
    expect(ids).toContain('golang')
    expect(ids).toContain('common')
    expect(ids).not.toContain('typescript')
    expect(ids).not.toContain('python')
  })

  it('Go pack content is included', () => {
    const active = filterRulesByStack(['go'], ALL_PACKS)
    const go = active.find((p) => p.id === 'golang')
    expect(go?.content).toContain('idiomatic Go')
  })
})

describe('AC2: multi-stack loads all matching rule packs', () => {
  it('node + python project gets typescript and python packs', () => {
    const active = filterRulesByStack(['typescript', 'python'], ALL_PACKS)
    const ids = active.map((p) => p.id)
    expect(ids).toContain('typescript')
    expect(ids).toContain('python')
    expect(ids).toContain('common')
    expect(ids).not.toContain('golang')
  })
})
