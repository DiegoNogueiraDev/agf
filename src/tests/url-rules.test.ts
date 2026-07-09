import { describe, it, expect } from 'vitest'
import { createUrlPolicy } from '../core/security/url-rules.js'

describe('url-rules', () => {
  describe('createUrlPolicy', () => {
    it('should allow all URLs with no config', () => {
      const policy = createUrlPolicy()
      expect(policy.isAllowed('https://example.com')).toBe(true)
      expect(policy.isAllowed('https://evil.com/steal')).toBe(true)
    })

    describe('deny rules', () => {
      it('should deny URLs matching deny pattern', () => {
        const policy = createUrlPolicy({ denyPatterns: ['evil.com'] })
        expect(policy.isAllowed('https://evil.com/path')).toBe(false)
      })

      it('should allow URLs not in deny pattern', () => {
        const policy = createUrlPolicy({ denyPatterns: ['evil.com'] })
        expect(policy.isAllowed('https://safe.com/path')).toBe(true)
      })

      it('should support wildcard deny patterns', () => {
        const policy = createUrlPolicy({ denyPatterns: ['*.evil.com'] })
        expect(policy.isAllowed('https://sub.evil.com/path')).toBe(false)
      })

      it('should support regex-like deny patterns with *', () => {
        const policy = createUrlPolicy({ denyPatterns: ['example.com/*/secret'] })
        expect(policy.isAllowed('https://example.com/admin/secret')).toBe(false)
      })
    })

    describe('allow rules', () => {
      it('should deny URLs not matching allow pattern', () => {
        const policy = createUrlPolicy({ allowPatterns: ['*.safe.com'] })
        expect(policy.isAllowed('https://evil.com/path')).toBe(false)
      })

      it('should allow URLs matching allow pattern', () => {
        const policy = createUrlPolicy({ allowPatterns: ['*.safe.com'] })
        expect(policy.isAllowed('https://sub.safe.com/path')).toBe(true)
      })

      it('should deny when allow list is empty', () => {
        const policy = createUrlPolicy({ allowPatterns: ['specific.com'] })
        expect(policy.isAllowed('https://other.com/path')).toBe(false)
      })
    })

    describe('combined allow + deny', () => {
      it('should deny even if allow matches when deny also matches', () => {
        const policy = createUrlPolicy({
          allowPatterns: ['*.example.com'],
          denyPatterns: ['evil.example.com'],
        })
        expect(policy.isAllowed('https://evil.example.com/path')).toBe(false)
      })
    })

    describe('addDenyRule', () => {
      it('should dynamically add deny rules', () => {
        const policy = createUrlPolicy()
        policy.addDenyRule('example.com')
        expect(policy.isAllowed('https://example.com')).toBe(false)
      })

      it('should still allow non-denied URLs after adding rules', () => {
        const policy = createUrlPolicy()
        policy.addDenyRule('example.com')
        expect(policy.isAllowed('https://other.com')).toBe(true)
      })

      it('should support wildcard patterns in dynamic rules', () => {
        const policy = createUrlPolicy()
        policy.addDenyRule('*.evil.com')
        expect(policy.isAllowed('https://a.evil.com')).toBe(false)
      })
    })

    describe('path-based patterns', () => {
      it('should match ? as single char wildcard', () => {
        const policy = createUrlPolicy({ denyPatterns: ['example.com/cat'] })
        expect(policy.isAllowed('https://example.com/cat')).toBe(false)
      })
    })
  })
})
