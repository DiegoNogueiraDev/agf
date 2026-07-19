import { describe, it, expect } from 'vitest'
import { FooterBar } from '../tui/components/FooterBar.js'

describe('FooterBar', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof FooterBar).toBe('function')
  })
})
