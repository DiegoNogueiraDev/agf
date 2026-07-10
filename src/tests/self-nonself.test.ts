/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { buildSelfProfile, computeSelfScore, enrichWithSelfScores } from '../core/immune/self-nonself.js'
import type { DangerSignal } from '../core/immune/immune-types.js'

function makeSignal(overrides: Partial<DangerSignal> & { evidence: string }): DangerSignal {
  return {
    id: 'ds_test',
    kind: 'raw_throw',
    file: 'test.ts',
    line: 1,
    severity: 'high',
    confidence: 1,
    detectedAt: Date.now(),
    ...overrides,
  }
}

describe('buildSelfProfile', () => {
  it('extracts signatures from normal project files', () => {
    const files = [
      {
        path: 'src/utils/errors.ts',
        content: `
          export class AppError extends Error {
            constructor(msg: string) { super(msg) }
          }
          export function handleError(err: unknown) {
            if (err instanceof AppError) return
            throw err
          }
        `,
      },
      {
        path: 'src/core/main.ts',
        content: `
          import { AppError } from '../utils/errors.js'
          try {
            doSomething()
          } catch (err) {
            throw new AppError('failed')
          }
        `,
      },
    ]

    const profile = buildSelfProfile(files)
    expect(profile.signatures.length).toBeGreaterThan(0)
    expect(profile.allFiles).toHaveLength(2)
    expect(profile.builtAt).toBeGreaterThan(0)
  })

  it('skips test files', () => {
    const files = [
      { path: 'src/main.ts', content: 'const x = 1' },
      { path: 'src/main.test.ts', content: 'describe("x", () => {})' },
    ]

    const profile = buildSelfProfile(files)
    expect(profile.allFiles).toHaveLength(1)
  })

  it('handles empty file list', () => {
    const profile = buildSelfProfile([])
    expect(profile.signatures).toEqual([])
    expect(profile.allFiles).toHaveLength(0)
  })
})

describe('computeSelfScore', () => {
  it('returns 0.5 for empty evidence', () => {
    const profile = buildSelfProfile([{ path: 'a.ts', content: 'const x = 1' }])
    const signal = makeSignal({ evidence: '' })
    expect(computeSelfScore(signal, profile)).toBe(0.5)
  })

  it('returns 0.5 when self profile is empty', () => {
    const profile = buildSelfProfile([])
    const signal = makeSignal({ evidence: 'throw new Error("x")' })
    expect(computeSelfScore(signal, profile)).toBe(0.5)
  })

  it('returns higher score for evidence matching self patterns', () => {
    const profile = buildSelfProfile([
      {
        path: 'src/a.ts',
        content: `function f() { console.error('x'); throw new Error('fail') }`,
      },
    ])
    const matching = makeSignal({ kind: 'console_error', evidence: `console.error('x'); throw new Error('fail')` })
    const scoreMatching = computeSelfScore(matching, profile)

    const mismatch = makeSignal({ kind: 'raw_throw', evidence: `throw new Error('unusual pattern xyz')` })
    const scoreMismatch = computeSelfScore(mismatch, profile)

    expect(scoreMatching).toBeGreaterThanOrEqual(scoreMismatch)
  })
})

describe('enrichWithSelfScores', () => {
  it('adds selfScore to all signals', () => {
    const profile = buildSelfProfile([{ path: 'a.ts', content: 'throw new Error()' }])
    const signals = [
      makeSignal({ evidence: 'throw new Error("x")' }),
      makeSignal({ id: 'ds_2', evidence: 'unknown pattern zzz' }),
    ]

    const enriched = enrichWithSelfScores(signals, profile)
    expect(enriched).toHaveLength(2)
    for (const s of enriched) {
      expect(typeof s.selfScore).toBe('number')
    }
  })

  it('does not mutate original signals', () => {
    const profile = buildSelfProfile([{ path: 'a.ts', content: 'x' }])
    const signal = makeSignal({ evidence: 'test' })
    const originalScore = signal.selfScore

    enrichWithSelfScores([signal], profile)
    expect(signal.selfScore).toBe(originalScore)
  })
})
