/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { detectBannedPhrases, BANNED_PHRASES } from '../core/hooks/anti-hallucination-detector.js'

describe('anti-hallucination-detector', () => {
  describe('detectBannedPhrases', () => {
    it('returns empty for null or undefined', () => {
      expect(detectBannedPhrases(null)).toEqual([])
      expect(detectBannedPhrases(undefined)).toEqual([])
    })

    it('returns empty for safe text', () => {
      expect(detectBannedPhrases('This is a concrete implementation')).toEqual([])
    })

    it('detects "typically"', () => {
      expect(detectBannedPhrases('this is typically done')).toContain('typically')
    })

    it('detects "standard practice"', () => {
      expect(detectBannedPhrases('standard practice is to use')).toContain('standard practice')
    })

    it('detects "best practice"', () => {
      expect(detectBannedPhrases('this is a best practice')).toContain('best practice')
    })

    it('detects "obviously"', () => {
      expect(detectBannedPhrases('obviously this works')).toContain('obviously')
    })

    it('detects multiple banned phrases', () => {
      const hits = detectBannedPhrases('typically this is obviously the best practice')
      expect(hits).toContain('typically')
      expect(hits).toContain('obviously')
      expect(hits).toContain('best practice')
    })

    it('does not match inside larger words', () => {
      expect(detectBannedPhrases('normalize')).not.toContain('normally')
    })

    it('is case insensitive', () => {
      expect(detectBannedPhrases('As Expected we see')).toContain('as expected')
    })

    it('contains all expected banned phrases', () => {
      expect(BANNED_PHRASES).toContain('standard practice')
      expect(BANNED_PHRASES).toContain('typically')
      expect(BANNED_PHRASES).toContain('obviously')
      expect(BANNED_PHRASES).toContain('normally')
      expect(BANNED_PHRASES).toContain('as expected')
      expect(BANNED_PHRASES).toContain('best practice')
      expect(BANNED_PHRASES).toContain('common pattern')
      expect(BANNED_PHRASES).toContain('generally')
    })
  })
})
