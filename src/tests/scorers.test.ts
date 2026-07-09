import { describe, it, expect } from 'vitest'
import { testsGreen } from '../core/evals/scorers.js'
import type { TestRunResult } from '../core/evals/scorers.js'

function makeRunner(passed: boolean, output = ''): (cmd: string, dir: string) => TestRunResult {
  return (_cmd, _dir) => ({ passed, output })
}

describe('testsGreen', () => {
  it('returns true when injected runner passes', () => {
    const result = testsGreen('.', 'echo', makeRunner(true, 'ok'))
    expect(result.passed).toBe(true)
  })

  it('returns false when injected runner fails', () => {
    const result = testsGreen('.', 'false', makeRunner(false, 'error output'))
    expect(result.passed).toBe(false)
  })

  it('returns output from the runner', () => {
    const result = testsGreen('.', 'cmd', makeRunner(true, 'test output here'))
    expect(result.output).toBe('test output here')
  })

  it('returns object with passed and output fields', () => {
    const result = testsGreen('.', 'cmd', makeRunner(false))
    expect(typeof result.passed).toBe('boolean')
    expect(typeof result.output).toBe('string')
  })
})
