import { describe, it, expect } from 'vitest'
import { formatElapsed } from '../tui/elapsed.js'
import { parseTerminalSize } from '../tui/terminal-size.js'
import { decide, decideOutput, DEFAULT_POLICY, type Signals } from '../tui/surface-decide.js'

describe('formatElapsed', () => {
  it('returns seconds for sub-minute durations', () => {
    expect(formatElapsed(5000)).toBe('5s')
    expect(formatElapsed(0)).toBe('0s')
    expect(formatElapsed(999)).toBe('0s')
    expect(formatElapsed(59999)).toBe('59s')
  })

  it('returns minutes and seconds for 1–59 minute durations', () => {
    expect(formatElapsed(60000)).toBe('1m 00s')
    expect(formatElapsed(83000)).toBe('1m 23s')
    expect(formatElapsed(3599000)).toBe('59m 59s')
  })

  it('returns hours and zero-padded minutes for hour+ durations', () => {
    expect(formatElapsed(3600000)).toBe('1h 00m')
    expect(formatElapsed(3660000)).toBe('1h 01m')
    expect(formatElapsed(7323000)).toBe('2h 02m')
  })

  it('clamps negative values to 0s', () => {
    expect(formatElapsed(-5000)).toBe('0s')
  })
})

describe('parseTerminalSize', () => {
  it('returns provided rows and columns when both are positive', () => {
    const result = parseTerminalSize({ rows: 40, columns: 120 })
    expect(result).toEqual({ rows: 40, columns: 120 })
  })

  it('falls back to 24x80 when rows or columns are 0', () => {
    expect(parseTerminalSize({ rows: 0, columns: 80 })).toEqual({ rows: 24, columns: 80 })
    expect(parseTerminalSize({ rows: 40, columns: 0 })).toEqual({ rows: 24, columns: 80 })
    expect(parseTerminalSize({ rows: 0, columns: 0 })).toEqual({ rows: 24, columns: 80 })
  })

  it('falls back to 24x80 when properties are missing', () => {
    expect(parseTerminalSize({})).toEqual({ rows: 24, columns: 80 })
  })

  it('falls back to 24x80 when properties are undefined', () => {
    expect(parseTerminalSize({ rows: undefined, columns: undefined })).toEqual({ rows: 24, columns: 80 })
  })
})

describe('decide (surface-decide)', () => {
  it('returns markdown for default fallback (no signals)', () => {
    const result = decide({}, DEFAULT_POLICY)
    expect(result.format).toBe('markdown')
    expect(result.matchedRule).toBe('Default fallback')
  })

  it('returns html for code-review intent with human consumer', () => {
    const signals: Signals = { intent: 'code-review', consumer: 'human-once' }
    const result = decide(signals, DEFAULT_POLICY)
    expect(result.format).toBe('html')
    expect(result.rationale).toContain('diffs')
  })

  it('returns json for data-extract intent', () => {
    const result = decide({ intent: 'data-extract' }, DEFAULT_POLICY)
    expect(result.format).toBe('json')
  })

  it('returns hybrid-md-html for spec with agent-next consumer', () => {
    const result = decide({ intent: 'spec', consumer: 'agent-next' }, DEFAULT_POLICY)
    expect(result.format).toBe('hybrid-md-html')
  })

  it('returns markdown for spec with human consumer and small size', () => {
    const result = decide({ intent: 'spec', consumer: 'human-once', size: 'small' }, DEFAULT_POLICY)
    expect(result.format).toBe('markdown')
  })

  it('returns html for spec with human consumer and large size', () => {
    const result = decide({ intent: 'spec', consumer: 'human-archive', size: 'large' }, DEFAULT_POLICY)
    expect(result.format).toBe('html')
  })

  it('returns markdown for report intent', () => {
    const result = decide({ intent: 'report', consumer: 'human-once' }, DEFAULT_POLICY)
    expect(result.format).toBe('markdown')
  })

  it('includes promptPrefix from policy prompts', () => {
    const result = decide({ intent: 'data-extract' }, DEFAULT_POLICY)
    expect(result.promptPrefix).toContain('JSON')
  })

  it('throws when no rules match (empty policy without fallback)', () => {
    const emptyPolicy = { version: 1, rules: [], prompts: {} as never }
    expect(() => decide({ intent: 'spec' }, emptyPolicy)).toThrow()
  })
})

describe('decideOutput', () => {
  it('returns format and rationale for a known intent', () => {
    const result = decideOutput('data-extract')
    expect(result.format).toBe('json')
    expect(typeof result.rationale).toBe('string')
  })

  it('uses size when provided', () => {
    const small = decideOutput('spec', 'small')
    const large = decideOutput('spec', 'large')
    expect(small.format).toBe('markdown')
    expect(large.format).toBe('html')
  })
})
