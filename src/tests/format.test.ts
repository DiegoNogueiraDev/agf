import { describe, it, expect } from 'vitest'
import { formatGapsHuman } from '../core/gaps/format.js'
import { buildGapReport } from '../core/gaps/gap-types.js'

describe('formatGapsHuman', () => {
  it('returns a string', () => {
    const report = buildGapReport([])
    expect(typeof formatGapsHuman(report)).toBe('string')
  })

  it('shows COMPLETO for no gaps', () => {
    const report = buildGapReport([])
    const output = formatGapsHuman(report)
    expect(output).toContain('COMPLETO')
  })

  it('shows score and grade', () => {
    const report = buildGapReport([])
    const output = formatGapsHuman(report)
    expect(output).toContain('score')
    expect(output).toContain('grade')
  })

  it('shows LACUNAS when required gaps present', () => {
    const report = buildGapReport([
      {
        kind: 'missing_ac',
        severity: 'required',
        nodeId: 't1',
        evidence: 'Task t1 has no AC',
        enrichment: { action: 'add_nodes', instruction: 'Add AC', applyVia: ['agf node update t1'] },
      },
    ])
    const output = formatGapsHuman(report)
    expect(output).toContain('LACUNAS')
  })
})
