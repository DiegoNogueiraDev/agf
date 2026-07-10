import { describe, it, expect } from 'vitest'
import { PresetSchema } from '../schemas/preset.schema.js'

describe('PresetSchema', () => {
  it('accepts a minimal preset', () => {
    const result = PresetSchema.safeParse({
      name: 'strict-tdd',
      description: 'Enforces TDD',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    expect(PresetSchema.safeParse({ name: '', description: 'x' }).success).toBe(false)
  })

  it('rejects name > 100 chars', () => {
    expect(PresetSchema.safeParse({ name: 'x'.repeat(101), description: 'x' }).success).toBe(false)
  })

  it('accepts preset with tags and templates', () => {
    expect(
      PresetSchema.safeParse({
        name: 'enterprise',
        description: 'Full enterprise preset',
        tags: ['security', 'quality'],
        templates: ['epic-template', 'feature-template'],
      }).success,
    ).toBe(true)
  })

  it('accepts preset with dod customChecks', () => {
    expect(
      PresetSchema.safeParse({
        name: 'with-dod',
        description: 'Custom DoD',
        dod: {
          customChecks: [{ name: 'security_scan', description: 'Run SAST', phase: 'REVIEW', condition: 'scan_passed' }],
        },
      }).success,
    ).toBe(true)
  })
})
