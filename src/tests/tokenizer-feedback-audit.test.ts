/*!
 * TDD: tokenizer-feedback audit (node_a49e5988ada3).
 *
 * AC1: candidate that does NOT reduce real tokens is rejected (not in approved set).
 * AC2: candidate that reduces is approved and reused on next run.
 */

import { describe, it, expect } from 'vitest'
import {
  auditCandidate,
  createApprovedSet,
  type CompressionCandidate,
} from '../core/tool-compress/tokenizer-feedback-audit.js'

describe('AC1: non-reducing candidate is rejected', () => {
  it('rejects candidate where compressed version is same token count', () => {
    const approved = createApprovedSet()
    const candidate: CompressionCandidate = {
      id: 'filter-noop',
      before: 'hello world',
      after: 'hello world', // identical — no reduction
    }
    const result = auditCandidate(candidate, approved)
    expect(result.accepted).toBe(false)
    expect(approved.has('filter-noop')).toBe(false)
  })

  it('rejects candidate where compressed is larger', () => {
    const approved = createApprovedSet()
    const candidate: CompressionCandidate = {
      id: 'filter-bloat',
      before: 'x',
      after: 'x plus extra text that makes it longer', // larger
    }
    const result = auditCandidate(candidate, approved)
    expect(result.accepted).toBe(false)
    expect(approved.has('filter-bloat')).toBe(false)
  })
})

describe('AC2: reducing candidate is approved and reused', () => {
  it('approves candidate that reduces tokens', () => {
    const approved = createApprovedSet()
    const candidate: CompressionCandidate = {
      id: 'filter-good',
      before: 'This is a very long text that will compress down significantly.',
      after: 'Short text.',
    }
    const result = auditCandidate(candidate, approved)
    expect(result.accepted).toBe(true)
    expect(result.tokensBefore).toBeGreaterThan(result.tokensAfter)
    expect(approved.has('filter-good')).toBe(true)
  })

  it('approved set persists across subsequent calls (reuse)', () => {
    const approved = createApprovedSet()
    const candidate: CompressionCandidate = {
      id: 'filter-reuse',
      before: 'a very long original text with many words to ensure reduction',
      after: 'short',
    }
    auditCandidate(candidate, approved)
    expect(approved.has('filter-reuse')).toBe(true)
    // Second call: already approved
    expect(approved.has('filter-reuse')).toBe(true)
  })
})
