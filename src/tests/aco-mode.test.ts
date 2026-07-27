import { describe, it, expect } from 'vitest'
import { resolveAcoMode, isPheromoneFieldInformative, shouldUseAco } from '../core/planner/aco-mode.js'

describe('resolveAcoMode', () => {
  it('returns "off" when --no-aco is set (overrides --aco)', () => {
    expect(resolveAcoMode({ noAco: true })).toBe('off')
    expect(resolveAcoMode({ aco: true, noAco: true })).toBe('off')
  })
  it('returns "on" when --aco is set', () => {
    expect(resolveAcoMode({ aco: true })).toBe('on')
  })
  it('returns "off" (strict priority is the default) when no flag is set', () => {
    expect(resolveAcoMode({})).toBe('off')
  })
})

describe('isPheromoneFieldInformative', () => {
  it('is false for an empty/cold field (all zero)', () => {
    expect(isPheromoneFieldInformative([])).toBe(false)
    expect(isPheromoneFieldInformative([0, 0, 0])).toBe(false)
  })
  it('is true when at least one trail is positive', () => {
    expect(isPheromoneFieldInformative([0, 0.4, 0])).toBe(true)
  })
})

describe('shouldUseAco', () => {
  it('always false when mode is off, even on an informative field', () => {
    expect(shouldUseAco('off', [1, 2, 3])).toBe(false)
  })
  it('always true when mode is on, even on a cold field', () => {
    expect(shouldUseAco('on', [0, 0, 0])).toBe(true)
  })
  it('auto → true only when the field is informative', () => {
    expect(shouldUseAco('auto', [0, 0])).toBe(false)
    expect(shouldUseAco('auto', [0, 0.5])).toBe(true)
  })
})
