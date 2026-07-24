import { describe, it, expect } from 'vitest'
import { HarnessWidget } from '../tui/components/HarnessWidget.js'

describe('HarnessWidget', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof HarnessWidget).toBe('function')
  })

  it('has a non-empty name', () => {
    expect(HarnessWidget.name).toBeTruthy()
  })
})
