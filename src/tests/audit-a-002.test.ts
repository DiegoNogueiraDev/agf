/**
 * AUDIT-002 — constraint-section bullets mis-typed as acceptance_criteria.
 *
 * Bullets were classified with no section context, so a constraint worded
 * "…critério de aceite" matched the AC patterns and became acceptance_criteria.
 * The enclosing section type must provide context: a bullet inside a constraint
 * section defaults to `constraint` unless a stronger signal (explicit checkbox
 * AC) applies.
 */
import { describe, it, expect } from 'vitest'
import { classifySection } from '../core/parser/classify.js'

describe('AUDIT-002: constraint-section bullets keep the constraint type', () => {
  it('does not reclassify a constraint bullet as AC just because it mentions "critério de aceite"', () => {
    const block = classifySection('Constraints', '- Paridade comportamental como critério de aceite', 2, 1, 2)
    expect(block.type).toBe('constraint')
    expect(block.items).toHaveLength(1)
    expect(block.items[0].type).toBe('constraint')
  })

  it('lets an explicit checkbox AC override the constraint section context', () => {
    const block = classifySection('Constraints', '- [ ] User can log out', 2, 1, 2)
    expect(block.items).toHaveLength(1)
    expect(block.items[0].type).toBe('acceptance_criteria')
  })
})
