import { describe, it, expect } from 'vitest'
import { TokenBudgetView, CostForecast } from '../tui/components/EconomyDashboard.js'

describe('EconomyDashboard', () => {
  it('TokenBudgetView is exported as a function (React component)', () => {
    expect(typeof TokenBudgetView).toBe('function')
  })

  it('CostForecast is exported as a function (React component)', () => {
    expect(typeof CostForecast).toBe('function')
  })
})
