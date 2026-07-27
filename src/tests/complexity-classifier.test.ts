/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { classifyComplexity, SMALL_BUDGET_TOKENS, LARGE_BUDGET_TOKENS } from '../core/llm/complexity-classifier.js'

describe('classifyComplexity', () => {
  it('returns tier2 for security tasks', () => {
    const result = classifyComplexity({ taskKind: 'security' })
    expect(result.tier).toBe('tier2')
    expect(result.reason).toContain('security')
  })

  it('returns tier2 for migration tasks', () => {
    const result = classifyComplexity({ taskKind: 'migration' })
    expect(result.tier).toBe('tier2')
  })

  it('returns tier2 for schema-change tasks', () => {
    const result = classifyComplexity({ taskKind: 'schema-change' })
    expect(result.tier).toBe('tier2')
  })

  it('returns tier0 for typo-fix', () => {
    const result = classifyComplexity({ taskKind: 'typo-fix' })
    expect(result.tier).toBe('tier0')
  })

  it('returns tier0 for format-only', () => {
    const result = classifyComplexity({ taskKind: 'format-only' })
    expect(result.tier).toBe('tier0')
  })

  it('returns tier0 for rename-symbol', () => {
    const result = classifyComplexity({ taskKind: 'rename-symbol' })
    expect(result.tier).toBe('tier0')
  })

  it('respects operator override', () => {
    const result = classifyComplexity({ taskKind: 'security', override: 'tier0' })
    expect(result.tier).toBe('tier0')
    expect(result.override).toBe(true)
  })

  it('returns tier2 for high criticality', () => {
    const result = classifyComplexity({ taskKind: 'feature', criticality: 'high' })
    expect(result.tier).toBe('tier2')
  })

  it('returns tier2 for large token budget', () => {
    const result = classifyComplexity({ taskKind: 'feature', tokenBudget: 50000 })
    expect(result.tier).toBe('tier2')
  })

  it('returns tier1 for medium token budget', () => {
    const result = classifyComplexity({ taskKind: 'feature', tokenBudget: SMALL_BUDGET_TOKENS })
    expect(result.tier).toBe('tier1')
  })

  it('returns tier1 for unknown task fallback', () => {
    const result = classifyComplexity({ taskKind: 'unknown' })
    expect(result.tier).toBe('tier1')
  })

  it('returns tier2 for ANALYZE phase', () => {
    const result = classifyComplexity({ taskKind: 'feature', phase: 'ANALYZE' })
    expect(result.tier).toBe('tier2')
  })

  it('returns tier1 for IMPLEMENT phase', () => {
    const result = classifyComplexity({ taskKind: 'feature', phase: 'IMPLEMENT' })
    expect(result.tier).toBe('tier1')
  })

  it('returns tier0 for LISTENING phase', () => {
    const result = classifyComplexity({ taskKind: 'feature', phase: 'LISTENING' })
    expect(result.tier).toBe('tier0')
  })

  it('exports SMALL_BUDGET_TOKENS and LARGE_BUDGET_TOKENS', () => {
    expect(SMALL_BUDGET_TOKENS).toBe(4000)
    expect(LARGE_BUDGET_TOKENS).toBe(32000)
  })
})
