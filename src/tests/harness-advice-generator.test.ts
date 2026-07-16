/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { buildAdviceEntries } from '../core/harness/harness-advice-generator.js'
import type { ViolationDetail } from '../core/harness/violation-detail.js'

describe('buildAdviceEntries', () => {
  it('returns empty array when all dimensions score >= 70', () => {
    const result = buildAdviceEntries({
      breakdown: { types: { score: 85, weight: 0.25 }, tests: { score: 90, weight: 0.25 } },
      typeViolations: [],
      testViolations: [],
    })
    expect(result).toEqual([])
  })

  it('generates advice for dimensions below threshold', () => {
    const typeViolations: ViolationDetail[] = [
      {
        file: 'src/foo.ts',
        line: 10,
        dimension: 'types',
        violationType: 'any_type',
        evidence: 'let x: any',
        confidence: 1.0,
      },
    ]
    const result = buildAdviceEntries({
      breakdown: { types: { score: 40, weight: 0.25 } },
      typeViolations,
      testViolations: [],
    })
    expect(result).toHaveLength(1)
    expect(result[0].dimension).toBe('types')
    expect(result[0].score).toBe(40)
    expect(result[0].files).toHaveLength(1)
    expect(result[0].files[0].file).toBe('src/foo.ts')
  })

  it('deduplicates violation files', () => {
    const typeViolations: ViolationDetail[] = [
      {
        file: 'src/foo.ts',
        line: 10,
        dimension: 'types',
        violationType: 'any_type',
        evidence: 'let x: any',
        confidence: 1.0,
      },
      {
        file: 'src/foo.ts',
        line: 20,
        dimension: 'types',
        violationType: 'any_type',
        evidence: 'let y: any',
        confidence: 1.0,
      },
    ]
    const result = buildAdviceEntries({
      breakdown: { types: { score: 40, weight: 0.25 } },
      typeViolations,
      testViolations: [],
    })
    expect(result[0].files).toHaveLength(1)
  })

  it('limits to MAX_FILES_PER_DIM (10) entries', () => {
    const typeViolations: ViolationDetail[] = Array.from({ length: 20 }, (_, i) => ({
      file: `src/file${i}.ts`,
      line: 1,
      dimension: 'types',
      violationType: 'any_type',
      evidence: 'any usage',
      confidence: 1.0,
    }))
    const result = buildAdviceEntries({
      breakdown: { types: { score: 40, weight: 0.25 } },
      typeViolations,
      testViolations: [],
    })
    expect(result[0].files).toHaveLength(10)
  })

  it('skips dimensions without violation arrays', () => {
    const result = buildAdviceEntries({
      breakdown: { naming: { score: 30, weight: 0.1 } },
      typeViolations: [],
      testViolations: [],
    })
    expect(result).toHaveLength(0)
  })
})
