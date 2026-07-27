/**
 * AUDIT-003 — CONSTRAINT_PATTERNS missed plural "Restrições" (ç+õ) and English
 * "Restriction(s)", so whole constraint sections were typed as epic.
 */
import { describe, it, expect } from 'vitest'
import { classifySectionTitle } from '../core/parser/classify.js'

describe('AUDIT-003: Restrições / Restrictions classify as constraint', () => {
  it('plural Portuguese "Restrições" → constraint', () => {
    expect(classifySectionTitle('Restrições', 2).type).toBe('constraint')
  })

  it('English "Restrictions" → constraint', () => {
    expect(classifySectionTitle('Restrictions', 2).type).toBe('constraint')
  })

  it('English singular "Restriction" → constraint', () => {
    expect(classifySectionTitle('Restriction', 2).type).toBe('constraint')
  })

  it('singular "Restrição" still → constraint (no regression)', () => {
    expect(classifySectionTitle('Restrição', 2).type).toBe('constraint')
  })
})
