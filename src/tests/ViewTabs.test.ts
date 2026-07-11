import { describe, it, expect } from 'vitest'
import { ViewTabs } from '../tui/components/ViewTabs.js'

describe('ViewTabs', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof ViewTabs).toBe('function')
  })

  it('has a non-empty name', () => {
    expect(ViewTabs.name).toBeTruthy()
  })
})
