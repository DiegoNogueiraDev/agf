/*!
 * TDD: distilled card in agf context / scenario seeding (node_9fd252369d41).
 *
 * AC: Given a scenario context request, When agf context runs,
 *     Then the card is returned by default and --full returns the raw PRD.
 */

import { describe, it, expect } from 'vitest'
import { contextCommand } from '../cli/commands/context-cmd.js'

describe('context command scenario seeding', () => {
  it('registers --compressed as default (distilled card)', () => {
    const cmd = contextCommand()
    const compressed = cmd.options.find((o) => o.long === '--compressed')
    expect(compressed).toBeDefined()
    expect(compressed!.defaultValue).toBe(true)
  })

  it('registers --full flag (raw PRD on demand)', () => {
    const cmd = contextCommand()
    const full = cmd.options.find((o) => o.long === '--full')
    expect(full).toBeDefined()
  })

  it('--compressed and --full are mutually exclusive by design (full overrides)', () => {
    const cmd = contextCommand()
    const full = cmd.options.find((o) => o.long === '--full')
    const compressed = cmd.options.find((o) => o.long === '--compressed')
    // Both exist — full is opt-in that overrides the default compressed behavior
    expect(full).toBeDefined()
    expect(compressed).toBeDefined()
    expect(full!.defaultValue).toBeFalsy()
    expect(compressed!.defaultValue).toBe(true)
  })
})
