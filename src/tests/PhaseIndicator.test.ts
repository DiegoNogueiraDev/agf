import { describe, it, expect } from 'vitest'
import { PhaseIndicator } from '../tui/components/PhaseIndicator.js'

describe('PhaseIndicator', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof PhaseIndicator).toBe('function')
  })

  it('has a non-empty name', () => {
    expect(PhaseIndicator.name).toBeTruthy()
  })
})
