import { describe, it, expect } from 'vitest'
import {
  getBuiltinConstitution,
  listBuiltinConstitutions,
  KARPATHY_BASELINE_NAME,
} from '../core/constitution/built-in-constitutions.js'

describe('KARPATHY_BASELINE_NAME', () => {
  it('is a non-empty string', () => {
    expect(typeof KARPATHY_BASELINE_NAME).toBe('string')
    expect(KARPATHY_BASELINE_NAME.length).toBeGreaterThan(0)
  })
})

describe('listBuiltinConstitutions', () => {
  it('returns a non-empty array', () => {
    const list = listBuiltinConstitutions()
    expect(Array.isArray(list)).toBe(true)
    expect(list.length).toBeGreaterThan(0)
  })

  it('each entry has name, description, principleCount', () => {
    for (const entry of listBuiltinConstitutions()) {
      expect(typeof entry.name).toBe('string')
      expect(typeof entry.description).toBe('string')
      expect(typeof entry.principleCount).toBe('number')
      expect(entry.principleCount).toBeGreaterThan(0)
    }
  })

  it('includes the karpathy-baseline constitution', () => {
    const names = listBuiltinConstitutions().map((c) => c.name)
    expect(names).toContain(KARPATHY_BASELINE_NAME)
  })
})

describe('getBuiltinConstitution', () => {
  it('returns the karpathy-baseline constitution', () => {
    const constitution = getBuiltinConstitution(KARPATHY_BASELINE_NAME)
    expect(constitution).toBeDefined()
    expect(constitution?.name).toBe(KARPATHY_BASELINE_NAME)
    expect(constitution?.principles.length).toBeGreaterThan(0)
  })

  it('returns undefined for unknown name', () => {
    expect(getBuiltinConstitution('does-not-exist')).toBeUndefined()
  })

  it('each principle has id, title, description', () => {
    const constitution = getBuiltinConstitution(KARPATHY_BASELINE_NAME)!
    for (const p of constitution.principles) {
      expect(typeof p.id).toBe('string')
      expect(typeof p.title).toBe('string')
      expect(typeof p.description).toBe('string')
    }
  })
})
