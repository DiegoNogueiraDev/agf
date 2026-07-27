/*!
 * TDD: mandatory red-before-green gate — strict-tdd preset (node_538d1ef24bbf).
 *
 * AC1: Given preset strict-tdd active, When task advances without RED test first,
 *      Then gate blocks.
 * AC2: Given preset default, When runs, Then non-blocking (behavior preserved).
 */

import { describe, it, expect } from 'vitest'
import { checkTddGate, type TddGateInput } from '../core/presets/tdd-workflow-gate.js'

describe('AC1: strict-tdd preset blocks without red test', () => {
  it('blocks when active preset is strict-tdd and hasRedTestFirst=false', () => {
    const input: TddGateInput = { activePreset: 'strict-tdd', hasRedTestFirst: false }
    const result = checkTddGate(input)
    expect(result.blocked).toBe(true)
    expect(result.reason).toBeTruthy()
  })

  it('passes when strict-tdd and hasRedTestFirst=true', () => {
    const input: TddGateInput = { activePreset: 'strict-tdd', hasRedTestFirst: true }
    const result = checkTddGate(input)
    expect(result.blocked).toBe(false)
  })
})

describe('AC2: default preset is non-blocking regardless of red test', () => {
  it('does not block when active preset is default without red test', () => {
    const input: TddGateInput = { activePreset: 'default', hasRedTestFirst: false }
    const result = checkTddGate(input)
    expect(result.blocked).toBe(false)
  })

  it('does not block when no preset is set', () => {
    const input: TddGateInput = { activePreset: undefined, hasRedTestFirst: false }
    const result = checkTddGate(input)
    expect(result.blocked).toBe(false)
  })
})
