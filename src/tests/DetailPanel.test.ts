import { describe, it, expect } from 'vitest'
import { DetailPanel } from '../tui/components/DetailPanel.js'

describe('DetailPanel', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof DetailPanel).toBe('function')
  })
})
