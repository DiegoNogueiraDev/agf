import { describe, it, expect } from 'vitest'
import { GraphTree } from '../tui/components/GraphTree.js'

describe('GraphTree', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof GraphTree).toBe('function')
  })
})
