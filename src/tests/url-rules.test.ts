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

    // Regression (node_c3a69c5dd92d): a '*.domain' wildcard must bind to the URL HOST with a
    // label boundary, not a raw-string .includes(). Otherwise a suffix-confusion domain
    // (example.com.evil.com) or a marker planted in the path/query/fragment slips past the
    // allow-list — an SSRF-class egress bypass.
    describe('wildcard host binding (SSRF bypass regression)', () => {
      const policy = createUrlPolicy({ allowPatterns: ['*.example.com'] })

      it('allows a genuine subdomain and the apex', () => {
        expect(policy.isAllowed('https://api.example.com/v1')).toBe(true)
        expect(policy.isAllowed('https://example.com/')).toBe(true)
      })

      it('DENIES a suffix-confusion attacker domain (example.com.evil.com)', () => {
        expect(policy.isAllowed('https://example.com.evil.com/x')).toBe(false)
      })

      it('DENIES a URL with the domain planted in the path/query/fragment', () => {
        expect(policy.isAllowed('https://evil.com/#.example.com')).toBe(false)
        expect(policy.isAllowed('https://evil.com/?r=api.example.com')).toBe(false)
        expect(policy.isAllowed('https://evil.com/api.example.com')).toBe(false)
      })

      it('DENIES a lookalike that only shares the suffix without a label boundary (notexample.com)', () => {
        expect(policy.isAllowed('https://notexample.com/')).toBe(false)
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
