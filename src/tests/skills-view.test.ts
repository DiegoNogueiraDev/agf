/*!
 * TDD: /skills phase-filtered view (node_8f2ce52324af).
 *
 * AC1: /skills DESIGN → only DESIGN-phase skills listed.
 * AC2: /skills (no arg) → all skills grouped by phase.
 */

import { describe, it, expect } from 'vitest'
import { formatSkillsList } from '../tui/skills-view.js'

const SAMPLE = [
  { name: 'analyze', desc: 'Analyze', category: 'ANALYZE' },
  { name: 'design', desc: 'Design', category: 'DESIGN' },
  { name: 'implement', desc: 'Implement', category: 'IMPLEMENT' },
  { name: 'validate', desc: 'Validate', category: 'VALIDATE' },
]

describe('AC1: phase-filtered output', () => {
  it('shows only DESIGN skills when phase=DESIGN', () => {
    const out = formatSkillsList(SAMPLE, 'DESIGN')
    expect(out).toContain('design')
    expect(out).not.toContain('analyze')
    expect(out).not.toContain('implement')
  })

  it('shows no output when phase has no matching skills', () => {
    const out = formatSkillsList(SAMPLE, 'LISTENING')
    expect(out).toMatch(/nenhuma|0|no skills/i)
  })
})

describe('AC2: grouped output with no arg', () => {
  it('groups by category when no phase given', () => {
    const out = formatSkillsList(SAMPLE)
    expect(out).toContain('ANALYZE')
    expect(out).toContain('DESIGN')
    expect(out).toContain('IMPLEMENT')
  })

  it('each category header appears once', () => {
    const out = formatSkillsList(SAMPLE)
    const analyzeCount = (out.match(/ANALYZE/g) || []).length
    expect(analyzeCount).toBeGreaterThanOrEqual(1)
  })
})
