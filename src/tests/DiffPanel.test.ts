import { describe, it, expect } from 'vitest'
import { DiffPanel } from '../tui/components/DiffPanel.js'

describe('DiffPanel', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof DiffPanel).toBe('function')
  })
})
