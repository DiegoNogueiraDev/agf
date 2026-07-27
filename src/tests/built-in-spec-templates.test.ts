import { describe, it, expect } from 'vitest'
import {
  getSpecTemplate,
  listSpecTemplates,
  BUILT_IN_SPEC_TEMPLATES,
} from '../core/spec-templates/built-in-spec-templates.js'

describe('BUILT_IN_SPEC_TEMPLATES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(BUILT_IN_SPEC_TEMPLATES)).toBe(true)
    expect(BUILT_IN_SPEC_TEMPLATES.length).toBeGreaterThan(0)
  })

  it('each template has name, phase, description, sections', () => {
    for (const t of BUILT_IN_SPEC_TEMPLATES) {
      expect(typeof t.name).toBe('string')
      expect(typeof t.phase).toBe('string')
      expect(typeof t.description).toBe('string')
      expect(Array.isArray(t.sections)).toBe(true)
    }
  })
})

describe('getSpecTemplate', () => {
  it('returns a template by name', () => {
    const name = BUILT_IN_SPEC_TEMPLATES[0].name
    const result = getSpecTemplate(name)
    expect(result).toBeDefined()
    expect(result?.name).toBe(name)
  })

  it('returns undefined for unknown name', () => {
    expect(getSpecTemplate('nonexistent-template-xyz')).toBeUndefined()
  })
})

describe('listSpecTemplates', () => {
  it('returns an array', () => {
    const list = listSpecTemplates()
    expect(Array.isArray(list)).toBe(true)
  })

  it('each entry has name, phase, description, sectionCount', () => {
    const list = listSpecTemplates()
    for (const entry of list) {
      expect(typeof entry.name).toBe('string')
      expect(typeof entry.phase).toBe('string')
      expect(typeof entry.description).toBe('string')
      expect(typeof entry.sectionCount).toBe('number')
    }
  })

  it('sectionCount matches actual sections array length', () => {
    const list = listSpecTemplates()
    for (const entry of list) {
      const tpl = getSpecTemplate(entry.name)
      expect(entry.sectionCount).toBe(tpl!.sections.length)
    }
  })

  it('has same count as BUILT_IN_SPEC_TEMPLATES', () => {
    expect(listSpecTemplates().length).toBe(BUILT_IN_SPEC_TEMPLATES.length)
  })
})
