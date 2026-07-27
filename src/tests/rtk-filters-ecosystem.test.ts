/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { testRunner } from '../core/tool-compress/filters/testRunner.js'
import { lintReport } from '../core/tool-compress/filters/lintReport.js'
import { autoDetectFilter } from '../core/tool-compress/autodetect.js'

describe('testRunner filter', () => {
  const vitest = ` RUN  v1.6.0 /repo

 ✓ src/a.test.ts (3 tests) 12ms
 ✓ src/b.test.ts (5 tests) 8ms
 ✓ src/c.test.ts (2 tests) 4ms
 ❯ src/d.test.ts (4 tests | 1 failed) 30ms
   × d > computes sum 5ms
     → expected 3 to be 4
 ✓ src/e.test.ts (6 tests) 10ms

 Test Files  1 failed | 4 passed (5)
      Tests  1 failed | 19 passed (20)
   Duration  3.20s`

  it('keeps the failure, its detail and the summary; collapses passes', () => {
    const out = testRunner(vitest)
    expect(out).toContain('× d > computes sum')
    expect(out).toContain('expected 3 to be 4')
    expect(out).toContain('Test Files  1 failed')
    expect(out).toContain('passando (colapsados)')
    // passing files are collapsed away
    expect(out).not.toContain('src/a.test.ts')
    expect(out.length).toBeLessThan(vitest.length)
  })

  it('handles jest FAIL blocks and collapses PASS', () => {
    const jest = `PASS src/a.test.ts
PASS src/b.test.ts
FAIL src/c.test.ts
  ● c › computes sum
    expected 3 to be 4
      at Object.<anonymous> (src/c.test.ts:10:5)
PASS src/d.test.ts
Tests:       1 failed, 19 passed, 20 total
Time:        3.2s`
    const out = testRunner(jest)
    expect(out).toContain('FAIL src/c.test.ts')
    expect(out).toContain('● c › computes sum')
    expect(out).toContain('expected 3 to be 4')
    expect(out).toContain('Tests:')
    expect(out).not.toContain('PASS src/a.test.ts')
  })

  it('handles pytest: keeps FAILED + summary, collapses all-pass progress', () => {
    const pytest = `============================= test session starts ==============================
collected 20 items

tests/test_a.py ......                                                   [ 30%]
tests/test_b.py ....F.                                                    [ 60%]
tests/test_c.py ......                                                    [100%]

FAILED tests/test_b.py::test_sum - assert 3 == 4
========================= 1 failed, 19 passed in 3.20s =========================`
    const out = testRunner(pytest)
    expect(out).toContain('FAILED tests/test_b.py::test_sum')
    expect(out).toContain('1 failed, 19 passed')
    expect(out).toContain('tests/test_b.py ....F.') // the failing progress line
    expect(out).not.toContain('tests/test_a.py') // all-pass collapsed
  })

  it('shrinks a large all-green run substantially', () => {
    const lines = [' RUN  v1.6.0 /repo', '']
    for (let i = 0; i < 300; i++) lines.push(` ✓ src/file${i}.test.ts (3 tests) ${i}ms`)
    lines.push(' Test Files  300 passed (300)', '      Tests  900 passed (900)', '   Duration  9.9s')
    const input = lines.join('\n')
    const out = testRunner(input)
    expect(out.length).toBeLessThan(input.length / 2)
    expect(out).toContain('Test Files  300 passed')
  })
})

describe('lintReport filter', () => {
  it('aggregates eslint stylish by rule and keeps the summary', () => {
    const header = '/repo/src/a.ts'
    const rows: string[] = [header]
    for (let i = 1; i <= 8; i++)
      rows.push(`  ${i}:5   warning  'v${i}' is assigned a value but never used  no-unused-vars`)
    rows.push('  40:1  error    Missing semicolon  semi')
    rows.push('', '✖ 9 problems (1 error, 8 warnings)')
    const input = rows.join('\n')
    const out = lintReport(input)
    expect(out).toContain('no-unused-vars × 8')
    expect(out).toContain('semi × 1')
    expect(out).toContain('✖ 9 problems')
    expect(out).toContain('... +5 more')
    expect(out.length).toBeLessThan(input.length)
  })

  it('aggregates tsc by error code and keeps the count', () => {
    const rows: string[] = []
    for (let i = 1; i <= 10; i++) rows.push(`src/a.ts(${i},5): error TS6133: 'x${i}' is declared but never used.`)
    rows.push(`src/b.ts(3,10): error TS2304: Cannot find name 'y'.`)
    rows.push(`src/c.ts(7,2): error TS2304: Cannot find name 'w'.`)
    rows.push('Found 12 errors in 3 files.')
    const input = rows.join('\n')
    const out = lintReport(input)
    expect(out).toContain('TS6133 × 10')
    expect(out).toContain('TS2304 × 2')
    expect(out).toContain('Found 12 errors')
    expect(out.length).toBeLessThan(input.length)
  })

  it('returns input unchanged when nothing parses', () => {
    const noise = 'just some prose\nwith no lint structure at all\nand a few words'
    expect(lintReport(noise)).toBe(noise)
  })
})

describe('autoDetectFilter routing', () => {
  it('routes vitest output to test-runner', () => {
    const fn = autoDetectFilter(' RUN  v1.6.0 /repo\n\n ✓ src/a.test.ts (3 tests) 1ms\n Tests  3 passed (3)')
    expect((fn as { filterName?: string })?.filterName).toBe('test-runner')
  })

  it('routes jest output to test-runner', () => {
    const fn = autoDetectFilter('PASS src/a.test.ts\nFAIL src/b.test.ts\nTests:  1 failed, 1 passed, 2 total')
    expect((fn as { filterName?: string })?.filterName).toBe('test-runner')
  })

  it('routes eslint output to lint-report', () => {
    const fn = autoDetectFilter(
      "/repo/src/a.ts\n  12:5  warning  'x' is unused  no-unused-vars\n\n✖ 1 problem (0 errors, 1 warning)",
    )
    expect((fn as { filterName?: string })?.filterName).toBe('lint-report')
  })

  it('routes tsc output to lint-report', () => {
    const fn = autoDetectFilter(
      "src/a.ts(12,5): error TS6133: 'x' is declared but never used.\nFound 1 error in 1 file.",
    )
    expect((fn as { filterName?: string })?.filterName).toBe('lint-report')
  })
})
