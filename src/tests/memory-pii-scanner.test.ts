/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { scanForPii, hasPii, redactPii } from '../core/hooks/memory-pii-scanner.js'

describe('memory-pii-scanner', () => {
  describe('scanForPii', () => {
    it('returns empty for no PII', () => {
      expect(scanForPii('hello world')).toEqual([])
    })

    it('returns empty for empty string', () => {
      expect(scanForPii('')).toEqual([])
    })

    it('detects email', () => {
      const hits = scanForPii('contact me at user@example.com')
      expect(hits).toHaveLength(1)
      expect(hits[0].kind).toBe('email')
    })

    it('detects SSN', () => {
      const hits = scanForPii('SSN: 123-45-6789')
      expect(hits).toHaveLength(1)
      expect(hits[0].kind).toBe('ssn')
    })

    it('detects credit card (Luhn-valid)', () => {
      // 4111111111111111 is a valid test CC number
      const hits = scanForPii('card: 4111111111111111')
      expect(hits).toHaveLength(1)
      expect(hits[0].kind).toBe('credit_card')
    })

    it('rejects invalid Luhn', () => {
      const hits = scanForPii('card: 1234567890123456')
      expect(hits.filter((h) => h.kind === 'credit_card')).toHaveLength(0)
    })

    it('detects API token (sk-...)', () => {
      const hits = scanForPii('token: sk-abc123def456ghi789jkl012')
      expect(hits).toHaveLength(1)
      expect(hits[0].kind).toBe('api_token')
    })

    it('detects GitHub token (ghp_...)', () => {
      const hits = scanForPii('ghp_abcdefghijklmnopqrstuvwxyz0123456789abcd')
      expect(hits).toHaveLength(1)
      expect(hits[0].kind).toBe('api_token')
    })

    it('detects multiple PII types', () => {
      const text = 'email: a@b.com ssn: 123-45-6789 token: sk-xxxxxxxxxxxxxxxxxxxx'
      const hits = scanForPii(text)
      const kinds = hits.map((h) => h.kind)
      expect(kinds).toContain('email')
      expect(kinds).toContain('ssn')
      expect(kinds).toContain('api_token')
    })
  })

  describe('hasPii', () => {
    it('returns false for clean text', () => {
      expect(hasPii('no secrets here')).toBe(false)
    })

    it('returns true for text with email', () => {
      expect(hasPii('email me@me.com')).toBe(true)
    })
  })

  describe('redactPii', () => {
    it('returns same text when no PII', () => {
      expect(redactPii('clean text')).toBe('clean text')
    })

    it('redacts email', () => {
      const result = redactPii('email: user@example.com')
      expect(result).not.toContain('user@example.com')
      expect(result).toContain('[REDACTED-EMAIL]')
    })

    it('redacts SSN', () => {
      const result = redactPii('ssn: 123-45-6789')
      expect(result).toContain('[REDACTED-SSN]')
    })

    it('redacts credit card', () => {
      const result = redactPii('card: 4111111111111111')
      expect(result).toContain('[REDACTED-CC]')
    })

    it('redacts API token', () => {
      const result = redactPii('sk-abcdefghijklmnopqrstuvwx')
      expect(result).toContain('[REDACTED-TOKEN]')
    })

    it('redacts multiple PII in one pass', () => {
      const text = 'email: a@b.com token: sk-xxxxxxxxxxxxxxxxxxxx'
      const result = redactPii(text)
      expect(result).toContain('[REDACTED-EMAIL]')
      expect(result).toContain('[REDACTED-TOKEN]')
      expect(result).not.toContain('a@b.com')
      expect(result).not.toContain('sk-')
    })
  })
})
