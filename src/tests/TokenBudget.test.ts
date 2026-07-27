import { describe, it, expect } from 'vitest'
import { TokenBudget } from '../tui/components/TokenBudget.js'

describe('TokenBudget', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof TokenBudget).toBe('function')
  })

  it('has a non-empty name', () => {
    expect(TokenBudget.name).toBeTruthy()
  })
})
