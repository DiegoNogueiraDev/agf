import { describe, it, expect } from 'vitest'
import { scanReposCommand, evaluateGoldCapabilities } from '../cli/commands/scan-repos-cmd.js'

describe('scanReposCommand', () => {
  it('returns a Command instance', () => {
    const cmd = scanReposCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = scanReposCommand()
    expect(cmd.name()).toBe('scan-repos')
  })

  it('has a non-empty description', () => {
    const cmd = scanReposCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })

  it('declares an --eval option', () => {
    const cmd = scanReposCommand()
    expect(cmd.options.some((o) => o.long === '--eval')).toBe(true)
  })
})

describe('evaluateGoldCapabilities (node_wire_6578bd0e8998 — scan-eval wire)', () => {
  it('scores the real gold fixture against real agfCapabilities()-based predictions', () => {
    const result = evaluateGoldCapabilities()
    expect(result.total).toBe(15)
    expect(result.precision).toBeGreaterThanOrEqual(0)
    expect(result.precision).toBeLessThanOrEqual(1)
    expect(result.recall).toBeGreaterThanOrEqual(0)
    expect(result.recall).toBeLessThanOrEqual(1)
    // tp+fp+fn must not exceed total (a correctness invariant of computeScanEval itself)
    expect(result.tp + result.fp + result.fn).toBeLessThanOrEqual(result.total)
  })
})
