import { describe, it, expect } from 'vitest'
import { SkillProgress } from '../tui/components/SkillProgress.js'

describe('SkillProgress', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof SkillProgress).toBe('function')
  })

  it('has a non-empty name', () => {
    expect(SkillProgress.name).toBeTruthy()
  })
})
