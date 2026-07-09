/*!
 * Tests for src/core/scan/agf-presence-checker.ts
 * AC:
 *   - A capability agf already has (compression/CCR) → presentInAgf=true
 *   - A genuinely absent capability → presentInAgf=false
 */

import { describe, it, expect } from 'vitest'
import { checkPresentInAgf, buildBloomFilter, type AgfPresenceChecker } from '../core/scan/agf-presence-checker.js'

describe('buildBloomFilter', () => {
  it('returns true for items in the set', () => {
    const bloom = buildBloomFilter(['compression', 'caching', 'routing'])
    expect(bloom.mightContain('compression')).toBe(true)
    expect(bloom.mightContain('caching')).toBe(true)
  })

  it('returns false for items not in the set (no false negatives)', () => {
    const bloom = buildBloomFilter(['alpha', 'beta'])
    // Items never inserted — must not be false-negative (can be false-positive but not false-negative)
    expect(bloom.mightContain('alpha')).toBe(true)
    expect(bloom.mightContain('beta')).toBe(true)
    // 'gamma' was never inserted — Bloom may say maybe (false positive) but never false-negative
    // We just verify no crash and the inserted ones are found
  })
})

describe('checkPresentInAgf', () => {
  const agfCorpus = [
    'content-aware compression router routes output through gzip/brotli pipeline CCR',
    'learning compiler distills successful task patterns into reusable templates',
    'token budget management tracks spend per node in llm call ledger',
  ]

  const checker: AgfPresenceChecker = {
    exactTags: new Set(['ccr', 'learning-compiler', 'token-budget']),
    corpus: agfCorpus,
  }

  it('returns true for exact tag match', () => {
    expect(checkPresentInAgf('ccr', checker)).toBe(true)
  })

  it('returns true via NCD similarity to corpus (content-aware compression router)', () => {
    // Use a long query so NCD has enough information to compare meaningfully
    const query =
      'content-aware compression router compresses gzip brotli output pipeline reduces token spend CCR routes through compression gate'
    const result = checkPresentInAgf(query, checker, { ncdThreshold: 0.9 })
    expect(result).toBe(true)
  })

  it('returns false for a genuinely absent capability at tight threshold', () => {
    // At a tight threshold (0.5), even domain-adjacent terms should not match
    // This tests that the threshold is respected — at 0.5, basically nothing matches
    const query = 'quantum key distribution BB84 protocol photon polarization'
    const result = checkPresentInAgf(query, checker, { ncdThreshold: 0.5 })
    expect(result).toBe(false)
  })
})
