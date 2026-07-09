import { describe, it, expect } from 'vitest'
import { evaluateSurgicalScope } from '../core/implementer/surgical-scope.js'

describe('evaluateSurgicalScope', () => {
  it('passes and skips when declaredFiles is empty', () => {
    const result = evaluateSurgicalScope({ declaredFiles: [], modifiedFiles: ['src/foo.ts'] })
    expect(result.passed).toBe(true)
    expect(result.skipped).toBe(true)
  })

  it('passes and skips when modifiedFiles is empty', () => {
    const result = evaluateSurgicalScope({ declaredFiles: ['src/foo.ts'], modifiedFiles: [] })
    expect(result.passed).toBe(true)
    expect(result.skipped).toBe(true)
  })

  it('passes when all modified files are within declared scope', () => {
    const result = evaluateSurgicalScope({
      declaredFiles: ['src/core/foo.ts', 'src/core/bar.ts'],
      modifiedFiles: ['src/core/foo.ts'],
    })
    expect(result.passed).toBe(true)
    expect(result.outOfScopeRatio).toBe(0)
    expect(result.outOfScopeFiles).toHaveLength(0)
  })

  it('fails when most modified files are outside declared scope', () => {
    const result = evaluateSurgicalScope({
      declaredFiles: ['src/core/foo.ts'],
      modifiedFiles: ['src/core/bar.ts', 'src/core/baz.ts', 'src/core/qux.ts'],
      thresholdRatio: 0.1,
    })
    expect(result.passed).toBe(false)
    expect(result.outOfScopeFiles.length).toBeGreaterThan(0)
  })

  it('passes when out-of-scope ratio is within threshold', () => {
    const result = evaluateSurgicalScope({
      declaredFiles: ['src/core/foo.ts', 'src/core/bar.ts'],
      modifiedFiles: ['src/core/foo.ts', 'src/core/bar.ts', 'src/core/extra.ts'],
      thresholdRatio: 0.5,
    })
    expect(result.passed).toBe(true)
  })
})
