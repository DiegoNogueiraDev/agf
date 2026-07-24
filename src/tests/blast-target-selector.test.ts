import { describe, it, expect } from 'vitest'
import { selectBlastTarget } from '../core/code/blast-target-selector.js'

describe('selectBlastTarget — AC2: no-op fast path when nothing changed', () => {
  it('returns noOp=true when changedFiles is empty', () => {
    const result = selectBlastTarget([], new Set(['src/tests/foo.test.ts']))
    expect(result.noOp).toBe(true)
  })

  it('returns noOp=true when changedFiles is empty regardless of testFiles', () => {
    const result = selectBlastTarget([], new Set())
    expect(result.noOp).toBe(true)
  })
})

describe('selectBlastTarget — AC1: only affected tests run', () => {
  it('returns specific test files when code index resolves them', () => {
    const testFiles = new Set(['src/tests/foo.test.ts', 'src/tests/bar.test.ts'])
    const result = selectBlastTarget(['src/core/foo.ts'], testFiles)
    expect(result.noOp).toBe(false)
    if (!result.noOp) {
      expect(result.files).toEqual(['src/tests/foo.test.ts', 'src/tests/bar.test.ts'])
      expect(result.fallback).toBe(false)
    }
  })

  it('returns fallback=true when code index yields empty set for changed files', () => {
    const result = selectBlastTarget(['src/core/foo.ts'], new Set())
    expect(result.noOp).toBe(false)
    if (!result.noOp) {
      expect(result.fallback).toBe(true)
    }
  })
})
