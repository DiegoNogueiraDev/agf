import { describe, it, expect } from 'vitest'
import { PhaseTabs } from '../tui/components/PhaseTabs.js'

describe('PhaseTabs', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof PhaseTabs).toBe('function')
  })

  it('has a non-empty name', () => {
    expect(PhaseTabs.name).toBeTruthy()
  })
})
