/*!
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest'
import { z } from 'zod/v4'
import { RecipeSchema, RecipeStepSchema, AssertionSchema } from '../schemas/recipe.schema.js'
import {
  ViolationDetailSchema,
  RemediationSuggestionSchema,
  ValidationResultSchema,
  HarnessDimensionSchema,
  RemediationCategorySchema,
} from '../schemas/remediation-schema.js'
import { ReviewReadinessCheckSchema, ReviewReadinessReportSchema } from '../schemas/reviewer-schema.js'

// ─── recipe.schema.ts ─────────────────────────────────────────────────────

describe('AssertionSchema', () => {
  it('parses a valid assertion', () => {
    const data = { type: 'visible', selector: '.btn', value: 'Submit' }
    expect(AssertionSchema.parse(data)).toEqual(data)
  })

  it('parses a minimal assertion', () => {
    const data = { type: 'url' }
    expect(AssertionSchema.parse(data)).toEqual(data)
  })

  it('rejects invalid type', () => {
    expect(() => AssertionSchema.parse({ type: 'invalid' })).toThrow(z.ZodError)
  })
})

describe('RecipeStepSchema', () => {
  const base = { evidence_before: 'ss1.png', evidence_after: 'ss2.png' }

  it('parses a navigate step', () => {
    const data = { kind: 'navigate', ...base, payload: 'https://example.com' }
    expect(RecipeStepSchema.parse(data).kind).toBe('navigate')
  })

  it('parses a click step', () => {
    const data = { kind: 'click', ...base, selector: '#btn' }
    expect(RecipeStepSchema.parse(data).kind).toBe('click')
  })

  it('parses a type step', () => {
    const data = { kind: 'type', ...base, selector: '#input', payload: 'hello' }
    expect(RecipeStepSchema.parse(data).kind).toBe('type')
  })

  it('parses a scroll step', () => {
    const data = { kind: 'scroll', ...base, coords: { x: 0, y: 500 } }
    expect(RecipeStepSchema.parse(data).kind).toBe('scroll')
  })

  it('parses a wait step', () => {
    const data = { kind: 'wait', ...base, payload: '2000' }
    expect(RecipeStepSchema.parse(data).kind).toBe('wait')
  })

  it('parses an assert step', () => {
    const data = { kind: 'assert', ...base, assert_after: { type: 'visible', selector: '.msg' } }
    expect(RecipeStepSchema.parse(data).kind).toBe('assert')
  })

  it('parses a screenshot step', () => {
    const data = { kind: 'screenshot', ...base }
    expect(RecipeStepSchema.parse(data).kind).toBe('screenshot')
  })

  it('rejects unknown kind', () => {
    expect(() => RecipeStepSchema.parse({ kind: 'unknown', evidence_before: 'a', evidence_after: 'b' })).toThrow(
      z.ZodError,
    )
  })

  it('rejects missing evidence_before', () => {
    expect(() => RecipeStepSchema.parse({ kind: 'click', selector: '#btn', evidence_after: 'b' })).toThrow(z.ZodError)
  })
})

describe('RecipeSchema', () => {
  const validStep = { kind: 'click', selector: '#btn', evidence_before: 'b.png', evidence_after: 'a.png' }
  const valid = { runId: 'run-1', createdAt: 1700000000000, steps: [validStep] }

  it('parses a valid recipe', () => {
    expect(RecipeSchema.parse(valid)).toEqual(valid)
  })

  it('rejects empty steps', () => {
    expect(() => RecipeSchema.parse({ ...valid, steps: [] })).toThrow(z.ZodError)
  })

  it('rejects missing runId', () => {
    const { runId: _, ...noId } = valid
    expect(() => RecipeSchema.parse(noId)).toThrow(z.ZodError)
  })

  it('accepts optional meta', () => {
    const data = { ...valid, meta: { source: 'test', traceId: 'abc' } }
    const parsed = RecipeSchema.parse(data)
    expect(parsed.meta).toEqual({ source: 'test', traceId: 'abc' })
  })
})

// ─── remediation-schema.ts ────────────────────────────────────────────────

describe('HarnessDimensionSchema', () => {
  it('accepts valid dimensions', () => {
    const dims = ['types', 'tests', 'naming', 'errors', 'context', 'docs', 'fitness'] as const
    for (const d of dims) expect(HarnessDimensionSchema.parse(d)).toBe(d)
  })

  it('rejects invalid dimension', () => {
    expect(() => HarnessDimensionSchema.parse('security')).toThrow(z.ZodError)
  })
})

describe('RemediationCategorySchema', () => {
  it('accepts valid categories', () => {
    for (const c of ['remove', 'replace', 'add', 'refactor'] as const) {
      expect(RemediationCategorySchema.parse(c)).toBe(c)
    }
  })

  it('rejects invalid category', () => {
    expect(() => RemediationCategorySchema.parse('delete')).toThrow(z.ZodError)
  })
})

describe('ViolationDetailSchema', () => {
  const valid = {
    file: 'src/foo.ts',
    line: 42,
    dimension: 'types',
    violationType: 'any_usage',
    evidence: 'const x: any = 1',
    confidence: 1,
  }

  it('parses a valid violation', () => {
    expect(ViolationDetailSchema.parse(valid)).toEqual(valid)
  })

  it('accepts optional column and suggestedFix', () => {
    const data = { ...valid, column: 5, suggestedFix: 'const x: number = 1' }
    const parsed = ViolationDetailSchema.parse(data)
    expect(parsed.column).toBe(5)
    expect(parsed.suggestedFix).toBe('const x: number = 1')
  })

  it('rejects negative line', () => {
    expect(() => ViolationDetailSchema.parse({ ...valid, line: -1 })).toThrow(z.ZodError)
  })

  it('rejects out-of-range confidence', () => {
    expect(() => ViolationDetailSchema.parse({ ...valid, confidence: 1.5 })).toThrow(z.ZodError)
  })
})

describe('RemediationSuggestionSchema', () => {
  const violation = {
    file: 'src/foo.ts',
    line: 10,
    dimension: 'types',
    violationType: 'any_usage',
    evidence: 'any',
    confidence: 1,
  }
  const valid = {
    ruleId: 'R001',
    violation,
    suggestedFix: 'const x: number = 1',
    confidence: 0.9,
    category: 'replace',
    priority: 75,
  }

  it('parses a valid suggestion', () => {
    expect(RemediationSuggestionSchema.parse(valid)).toEqual(valid)
  })

  it('rejects out-of-range priority', () => {
    expect(() => RemediationSuggestionSchema.parse({ ...valid, priority: 150 })).toThrow(z.ZodError)
  })
})

describe('ValidationResultSchema', () => {
  const valid = {
    ruleId: 'R001',
    file: 'src/bar.ts',
    violationType: 'any_usage',
    scoreBefore: 60,
    scoreAfter: 80,
    confirmed: true,
    autoSuppressed: false,
  }

  it('parses a valid validation result', () => {
    expect(ValidationResultSchema.parse(valid)).toEqual(valid)
  })

  it('rejects score over 100', () => {
    expect(() => ValidationResultSchema.parse({ ...valid, scoreAfter: 101 })).toThrow(z.ZodError)
  })
})

// ─── reviewer-schema.ts ─────────────────────────────────────────────────

describe('ReviewReadinessCheckSchema', () => {
  it('parses a valid readiness check', () => {
    const data = { name: 'has_ac', passed: true, details: 'AC exists', severity: 'required' }
    expect(ReviewReadinessCheckSchema.parse(data)).toEqual(data)
  })

  it('rejects invalid severity', () => {
    expect(() =>
      ReviewReadinessCheckSchema.parse({ name: 'x', passed: true, details: 'x', severity: 'invalid' }),
    ).toThrow(z.ZodError)
  })
})

describe('ReviewReadinessReportSchema', () => {
  const valid = {
    checks: [{ name: 'ac_check', passed: true, details: 'All ACs present', severity: 'required' }],
    ready: true,
    score: 85,
    grade: 'B',
    summary: 'Good to go',
  }

  it('parses a valid readiness report', () => {
    expect(ReviewReadinessReportSchema.parse(valid)).toEqual(valid)
  })

  it('rejects score > 100', () => {
    expect(() => ReviewReadinessReportSchema.parse({ ...valid, score: 120 })).toThrow(z.ZodError)
  })

  it('rejects invalid grade', () => {
    expect(() => ReviewReadinessReportSchema.parse({ ...valid, grade: 'Z' })).toThrow(z.ZodError)
  })
})
