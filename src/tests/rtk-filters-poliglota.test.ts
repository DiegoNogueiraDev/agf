/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { testRunner } from '../core/tool-compress/filters/testRunner.js'
import { lintReport } from '../core/tool-compress/filters/lintReport.js'
import { gitLog } from '../core/tool-compress/filters/gitLog.js'
import { autoDetectFilter } from '../core/tool-compress/registry.js'

const name = (fn: unknown): string | undefined => (fn as { filterName?: string })?.filterName

describe('testRunner — go test', () => {
  const go = `=== RUN   TestAdd
--- PASS: TestAdd (0.00s)
=== RUN   TestSub
--- FAIL: TestSub (0.00s)
    math_test.go:20: expected 1 got 2
=== RUN   TestMul
--- PASS: TestMul (0.00s)
=== RUN   TestDiv
--- PASS: TestDiv (0.00s)
FAIL	example/math	0.012s`

  it('mantém a falha + detalhe + pacote, colapsa os PASS/RUN', () => {
    const out = testRunner(go)
    expect(out).toContain('--- FAIL: TestSub')
    expect(out).toContain('expected 1 got 2')
    expect(out).toContain('example/math')
    expect(out).not.toContain('TestAdd')
    expect(out.length).toBeLessThan(go.length)
  })
})

describe('testRunner — cargo test', () => {
  const cargo = `running 4 tests
test tests::add ... ok
test tests::sub ... FAILED
test tests::mul ... ok
test tests::div ... ok

failures:

---- tests::sub stdout ----
thread 'tests::sub' panicked at 'assertion failed: left == right'

test result: FAILED. 3 passed; 1 failed; 0 ignored`

  it('mantém FAILED + panic + result, colapsa os ok', () => {
    const out = testRunner(cargo)
    expect(out).toContain('test tests::sub ... FAILED')
    expect(out).toContain('panicked')
    expect(out).toContain('test result: FAILED')
    expect(out).not.toContain('tests::add ... ok')
    expect(out.length).toBeLessThan(cargo.length)
  })
})

describe('testRunner — rspec', () => {
  const rspec = `.....F....

Failures:

  1) Calculator adds
     Failure/Error: expect(add(1,2)).to eq(4)
       expected: 4
            got: 3

10 examples, 1 failure`

  it('mantém Failure/Error + expected/got + sumário', () => {
    const out = testRunner(rspec)
    expect(out).toContain('Failure/Error')
    expect(out).toContain('expected: 4')
    expect(out).toContain('10 examples, 1 failure')
  })
})

describe('lintReport — ruff/flake8/pylint', () => {
  it('agrega por código e mantém localizações', () => {
    const rows: string[] = []
    for (let i = 1; i <= 9; i++) rows.push(`src/a.py:${i}:1: E501 line too long (88 > 79 characters)`)
    rows.push('src/b.py:3:5: F401 os imported but unused')
    rows.push('src/c.py:10:1: C0114 Missing module docstring')
    const input = rows.join('\n')
    const out = lintReport(input)
    expect(out).toContain('E501 × 9')
    expect(out).toContain('F401 × 1')
    expect(out).toContain('... +6 more')
    expect(out.length).toBeLessThan(input.length)
  })
})

describe('gitLog', () => {
  it('colapsa commit/Author/Date/corpo em uma linha por commit', () => {
    const log = `commit 1111111111111111111111111111111111111111
Author: Ada <ada@x>
Date:   Mon Jun 8 10:00:00 2026 +0000

    feat: add kanban board

    Body paragraph that should be dropped entirely.

commit 2222222222222222222222222222222222222222
Author: Bob <bob@x>
Date:   Mon Jun 8 11:00:00 2026 +0000

    fix: column ordering`
    const out = gitLog(log)
    expect(out).toContain('1111111 feat: add kanban board')
    expect(out).toContain('2222222 fix: column ordering')
    expect(out).not.toContain('Author:')
    expect(out).not.toContain('Body paragraph')
    expect(out.length).toBeLessThan(log.length)
  })
})

describe('autoDetect routing (poliglota)', () => {
  it('go/cargo/rspec → test-runner; ruff → lint-report; git log → git-log', () => {
    expect(name(autoDetectFilter('=== RUN   TestX\n--- PASS: TestX (0.0s)\nok  \tpkg\t0.1s'))).toBe('test-runner')
    expect(name(autoDetectFilter('running 2 tests\ntest a ... ok\ntest result: ok. 2 passed; 0 failed'))).toBe(
      'test-runner',
    )
    expect(name(autoDetectFilter('Failures:\n\n  1) x\n     Failure/Error: y\n\n3 examples, 1 failure'))).toBe(
      'test-runner',
    )
    expect(name(autoDetectFilter('src/a.py:1:1: E501 line too long\nsrc/b.py:2:1: F401 unused'))).toBe('lint-report')
    expect(name(autoDetectFilter('commit ' + '0'.repeat(40) + '\nAuthor: x\n\n    subj'))).toBe('git-log')
  })
})
