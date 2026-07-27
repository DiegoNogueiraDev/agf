import { describe, it, expect } from 'vitest'
import { runSentruxGate, saveGateBaseline } from '../core/integrations/sentrux-gate.js'
import type { GateBaseline } from '../core/integrations/sentrux-gate.js'

function makeBaseline(overrides: Partial<GateBaseline> = {}): GateBaseline {
  return {
    timestamp: 1000,
    quality_signal: 0.8,
    coupling_score: 0.4,
    cycle_count: 2,
    god_file_count: 3,
    hotspot_count: 5,
    complex_fn_count: 10,
    max_depth: 4,
    total_import_edges: 50,
    cross_module_edges: 15,
    ...overrides,
  }
}

describe('runSentruxGate', () => {
  it('passes when baseline and current are identical', () => {
    const baseline = makeBaseline()
    const result = runSentruxGate(baseline, baseline)
    expect(result.status).toBe('pass')
    expect(result.delta.quality_signal).toBe(0)
    expect(result.delta.god_file_count).toBe(0)
  })

  it('passes when quality_signal improves', () => {
    const baseline = makeBaseline({ quality_signal: 0.7 })
    const current = makeBaseline({ quality_signal: 0.9 })
    const result = runSentruxGate(baseline, current)
    expect(result.status).toBe('pass')
    expect(result.delta.quality_signal).toBeCloseTo(0.2)
  })

  it('fails when quality_signal drops by more than 0.1', () => {
    const baseline = makeBaseline({ quality_signal: 0.9 })
    const current = makeBaseline({ quality_signal: 0.75 })
    const result = runSentruxGate(baseline, current)
    expect(result.status).toBe('fail')
    expect(result.reasons).toBeDefined()
    expect(result.reasons?.some((r) => r.includes('quality_signal'))).toBe(true)
  })

  it('passes when quality_signal drops by exactly 0.1', () => {
    const baseline = makeBaseline({ quality_signal: 0.9 })
    const current = makeBaseline({ quality_signal: 0.8 })
    const result = runSentruxGate(baseline, current)
    expect(result.status).toBe('pass')
  })

  it('fails when god_file_count increases by more than 5', () => {
    const baseline = makeBaseline({ god_file_count: 3 })
    const current = makeBaseline({ god_file_count: 9 })
    const result = runSentruxGate(baseline, current)
    expect(result.status).toBe('fail')
    expect(result.reasons?.some((r) => r.includes('god_file_count'))).toBe(true)
  })

  it('passes when god_file_count increases by exactly 5', () => {
    const baseline = makeBaseline({ god_file_count: 3 })
    const current = makeBaseline({ god_file_count: 8 })
    const result = runSentruxGate(baseline, current)
    expect(result.status).toBe('pass')
  })

  it('fails with both reasons when both thresholds are exceeded', () => {
    const baseline = makeBaseline({ quality_signal: 0.9, god_file_count: 1 })
    const current = makeBaseline({ quality_signal: 0.7, god_file_count: 10 })
    const result = runSentruxGate(baseline, current)
    expect(result.status).toBe('fail')
    expect(result.reasons?.length).toBe(2)
  })

  it('delta contains all required fields', () => {
    const baseline = makeBaseline()
    const current = makeBaseline({ quality_signal: 0.9, coupling_score: 0.3, cycle_count: 1, god_file_count: 2 })
    const result = runSentruxGate(baseline, current)
    expect(typeof result.delta.quality_signal).toBe('number')
    expect(typeof result.delta.coupling_score).toBe('number')
    expect(typeof result.delta.cycle_count).toBe('number')
    expect(typeof result.delta.god_file_count).toBe('number')
  })

  it('does not include reasons on pass', () => {
    const baseline = makeBaseline()
    const result = runSentruxGate(baseline, baseline)
    expect(result.reasons).toBeUndefined()
  })
})

describe('saveGateBaseline', () => {
  it('returns valid JSON string', () => {
    const baseline = makeBaseline()
    const json = saveGateBaseline(baseline)
    expect(() => JSON.parse(json)).not.toThrow()
  })

  it('returned JSON contains quality_signal', () => {
    const baseline = makeBaseline({ quality_signal: 0.75 })
    const json = saveGateBaseline(baseline)
    const parsed = JSON.parse(json) as GateBaseline
    expect(parsed.quality_signal).toBe(0.75)
  })
})
