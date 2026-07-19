/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import type {
  HarnessDimension,
  ViolationDetail,
  RemediationSuggestion,
  ValidationResult,
} from '../core/harness/violation-detail.js'

describe('ViolationDetail type contract', () => {
  it('allows valid violation detail', () => {
    const v: ViolationDetail = {
      file: 'src/core/foo.ts',
      line: 42,
      dimension: 'types',
      violationType: 'any_usage',
      evidence: ': any',
      confidence: 1.0,
    }
    expect(v.file).toBe('src/core/foo.ts')
    expect(v.line).toBe(42)
    expect(v.dimension).toBe('types')
  })

  it('allows optional column and suggestedFix', () => {
    const v: ViolationDetail = {
      file: 'src/core/bar.ts',
      line: 10,
      column: 5,
      dimension: 'errors',
      violationType: 'raw_throw',
      evidence: 'throw new Error',
      confidence: 0.95,
      suggestedFix: 'throw new AppError',
    }
    expect(v.column).toBe(5)
    expect(v.suggestedFix).toBe('throw new AppError')
  })
})

describe('HarnessDimension type', () => {
  it('has exactly 7 valid values', () => {
    const dims: HarnessDimension[] = ['types', 'tests', 'naming', 'errors', 'context', 'docs', 'fitness']
    expect(dims).toHaveLength(7)
  })
})

describe('RemediationSuggestion type contract', () => {
  it('allows valid remediation suggestion', () => {
    const r: RemediationSuggestion = {
      ruleId: 'R001',
      violation: {
        file: 'src/core/foo.ts',
        line: 1,
        dimension: 'types',
        violationType: 'any_usage',
        evidence: ': any',
        confidence: 1.0,
      },
      suggestedFix: 'Replace `any` with `unknown`',
      confidence: 1.0,
      category: 'replace',
      priority: 80,
    }
    expect(r.category).toBe('replace')
    expect(r.priority).toBe(80)
  })
})

describe('ValidationResult type contract', () => {
  it('allows valid validation result', () => {
    const vr: ValidationResult = {
      ruleId: 'R001',
      file: 'src/core/foo.ts',
      violationType: 'any_usage',
      scoreBefore: 75,
      scoreAfter: 85,
      confirmed: true,
      autoSuppressed: false,
    }
    expect(vr.confirmed).toBe(true)
    expect(vr.autoSuppressed).toBe(false)
  })

  it('allows auto-suppressed result', () => {
    const vr: ValidationResult = {
      ruleId: 'R002',
      file: 'src/core/bar.ts',
      violationType: 'missing_jsdoc',
      scoreBefore: 80,
      scoreAfter: 80,
      confirmed: false,
      autoSuppressed: true,
    }
    expect(vr.confirmed).toBe(false)
    expect(vr.autoSuppressed).toBe(true)
  })
})
