/*!
 * Task node_19d0de1c12a2 — EconomyScenario Zod schema.
 *
 * AC: Given a malformed fixture, when loaded, parse throws with a field-level message.
 */

import { describe, it, expect } from 'vitest'
import { economyScenarioSchema } from '../schemas/economy-scenario.schema.js'

const valid = {
  id: 'e1-low-budget',
  prompt: 'Add a utility function formatTokenCount.',
  expectedResolved: true,
  tokenBudget: 2000,
}

describe('economyScenarioSchema', () => {
  it('parses a valid economy scenario', () => {
    const result = economyScenarioSchema.parse(valid)
    expect(result.id).toBe('e1-low-budget')
    expect(result.tokenBudget).toBe(2000)
  })

  it('throws with field-level message for missing id', () => {
    const bad = { ...valid, id: undefined }
    expect(() => economyScenarioSchema.parse(bad)).toThrow(/id/)
  })

  it('throws with field-level message for non-positive tokenBudget', () => {
    const bad = { ...valid, tokenBudget: 0 }
    expect(() => economyScenarioSchema.parse(bad)).toThrow(/tokenBudget|Number/)
  })

  it('throws with field-level message for missing prompt', () => {
    const bad = { ...valid, prompt: '' }
    expect(() => economyScenarioSchema.parse(bad)).toThrow(/prompt/)
  })
})
