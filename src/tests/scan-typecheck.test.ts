/*!
 * TDD: typecheck source in agf scan (node_f0a3b19cfa9f).
 *
 * AC1: Given a type error, When agf scan runs, Then it appears in findings
 *      with source='typecheck' and file:line.
 * AC2: Given type-clean code, When runs, Then no typecheck findings.
 */

import { describe, it, expect } from 'vitest'
import { parseTscOutput } from '../core/scan/typecheck-source.js'

const TSC_ERROR_OUTPUT = `src/foo.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/bar/baz.ts(3,1): error TS2304: Cannot find name 'foo'.
src/qux.ts(99,10): warning TS1234: Some warning message.`

const TSC_CLEAN = ''

describe('parseTscOutput', () => {
  it('AC1: parses type errors from tsc output', () => {
    const findings = parseTscOutput(TSC_ERROR_OUTPUT)
    expect(findings.length).toBe(3)
    expect(findings[0]!.source).toBe('typecheck')
    expect(findings[0]!.file).toBe('src/foo.ts')
    expect(findings[0]!.line).toBe(12)
    expect(findings[0]!.severity).toBe('error')
    expect(findings[0]!.message).toContain('TS2322')
  })

  it('parses nested path correctly', () => {
    const findings = parseTscOutput(TSC_ERROR_OUTPUT)
    expect(findings[1]!.file).toBe('src/bar/baz.ts')
    expect(findings[1]!.line).toBe(3)
  })

  it('AC2: returns empty array for clean output', () => {
    expect(parseTscOutput(TSC_CLEAN)).toEqual([])
  })

  it('ignores non-diagnostic lines (info/blank)', () => {
    const mixed = `\nStarting compilation...\nsrc/a.ts(1,1): error TS0001: bad.\n`
    const findings = parseTscOutput(mixed)
    expect(findings.length).toBe(1)
    expect(findings[0]!.file).toBe('src/a.ts')
  })
})
