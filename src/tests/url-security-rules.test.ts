/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * URL Security Rules — allow/deny, destructive action policies
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createUrlPolicy, type UrlPolicy, type UrlPolicyConfig } from '../core/security/url-rules.js'
import {
  createDestructivePolicy,
  type DestructivePolicy,
  type DestructiveAction,
} from '../core/security/destructive-actions.js'

describe('UrlPolicy', () => {
  let policy: UrlPolicy

  describe('deny rules only', () => {
    beforeEach(() => {
      policy = createUrlPolicy({ denyPatterns: ['*.malicious.com', '*evil*', 'http://localhost:3000/internal*'] })
    })

    it('allows arbitrary URLs when no deny match', () => {
      expect(policy.isAllowed('https://example.com/page')).toBe(true)
    })

    it('denies URLs matching specific deny pattern', () => {
      expect(policy.isAllowed('https://www.malicious.com/phish')).toBe(false)
    })

    it('denies URLs matching wildcard deny pattern', () => {
      expect(policy.isAllowed('https://evil-site.com/steal')).toBe(false)
    })

    it('denies URLs with path match', () => {
      expect(policy.isAllowed('http://localhost:3000/internal/admin')).toBe(false)
    })

    it('allows localhost non-matching paths', () => {
      expect(policy.isAllowed('http://localhost:3000/public')).toBe(true)
    })
  })

  describe('allowlist mode', () => {
    beforeEach(() => {
      policy = createUrlPolicy({ allowPatterns: ['https://*.trusted.com/*', 'https://app.example.com/*'] })
    })

    it('allows URLs matching allow patterns', () => {
      expect(policy.isAllowed('https://api.trusted.com/v1/data')).toBe(true)
    })

    it('denies URLs not matching any allow pattern (strict mode)', () => {
      expect(policy.isAllowed('https://evil.com')).toBe(false)
    })

    it('allows exact domain match', () => {
      expect(policy.isAllowed('https://app.example.com/dashboard')).toBe(true)
    })
  })

  describe('mixed allow and deny', () => {
    beforeEach(() => {
      policy = createUrlPolicy({
        allowPatterns: ['https://*.trusted.com/*'],
        denyPatterns: ['*evil*', '*malicious*'],
      })
    })

    it('allows trusted URL that passes both allow and deny', () => {
      expect(policy.isAllowed('https://good.trusted.com/page')).toBe(true)
    })

    it('denies trusted domain with evil path', () => {
      expect(policy.isAllowed('https://evil.trusted.com/page')).toBe(false)
    })
  })

  describe('empty rules', () => {
    beforeEach(() => {
      policy = createUrlPolicy({})
    })

    it('allows all URLs with no rules', () => {
      expect(policy.isAllowed('https://anything.com')).toBe(true)
    })
  })

  describe('from environment', () => {
    beforeEach(() => {
      process.env.URL_DENY = '*.blocked.com,*.evil.com'
      process.env.URL_ALLOW = ''
    })

    afterEach(() => {
      delete process.env.URL_DENY
      delete process.env.URL_ALLOW
    })

    it('reads deny patterns from environment', () => {
      const p = createUrlPolicy()
      expect(p.isAllowed('https://blocked.com/path')).toBe(false)
      expect(p.isAllowed('https://evil.com')).toBe(false)
      expect(p.isAllowed('https://good.com')).toBe(true)
    })
  })
})

describe('DestructivePolicy', () => {
  let policy: DestructivePolicy

  describe('allow mode', () => {
    beforeEach(() => {
      policy = createDestructivePolicy({ mode: 'allow' })
    })

    it('allows all destructive actions', () => {
      expect(policy.isAllowed('form_submit')).toBe(true)
      expect(policy.isAllowed('file_upload')).toBe(true)
      expect(policy.isAllowed('destructive_click')).toBe(true)
    })
  })

  describe('deny mode', () => {
    beforeEach(() => {
      policy = createDestructivePolicy({ mode: 'deny' })
    })

    it('denies all destructive actions', () => {
      expect(policy.isAllowed('form_submit')).toBe(false)
      expect(policy.isAllowed('file_upload')).toBe(false)
      expect(policy.isAllowed('destructive_click')).toBe(false)
    })
  })

  describe('ask mode', () => {
    beforeEach(() => {
      policy = createDestructivePolicy({ mode: 'ask' })
    })

    it('requires confirmation for destructive actions', () => {
      expect(policy.isAllowed('form_submit')).toBe(false)
      expect(policy.needsConfirmation('form_submit')).toBe(true)
    })
  })

  describe('from environment', () => {
    afterEach(() => {
      delete process.env.DESTRUCTIVE_POLICY
    })

    it('reads mode from DESTRUCTIVE_POLICY env', () => {
      process.env.DESTRUCTIVE_POLICY = 'ask'
      const p = createDestructivePolicy()
      expect(p.needsConfirmation('file_upload')).toBe(true)
    })

    it('defaults to deny when env is unset', () => {
      const p = createDestructivePolicy()
      expect(p.isAllowed('form_submit')).toBe(false)
    })
  })
})
