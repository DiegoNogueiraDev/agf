import { describe, it, expect } from 'vitest'
import { createDestructivePolicy } from '../core/security/destructive-actions.js'

describe('destructive-actions', () => {
  describe('createDestructivePolicy', () => {
    it('should deny actions by default', () => {
      const policy = createDestructivePolicy()
      expect(policy.isAllowed('form_submit')).toBe(false)
      expect(policy.needsConfirmation('form_submit')).toBe(false)
    })

    it('should deny when mode is deny', () => {
      const policy = createDestructivePolicy({ mode: 'deny' })
      expect(policy.isAllowed('form_submit')).toBe(false)
      expect(policy.needsConfirmation('form_submit')).toBe(false)
    })

    it('should allow when mode is allow', () => {
      const policy = createDestructivePolicy({ mode: 'allow' })
      expect(policy.isAllowed('form_submit')).toBe(true)
      expect(policy.needsConfirmation('form_submit')).toBe(false)
    })

    it('should deny but require confirmation when mode is ask', () => {
      const policy = createDestructivePolicy({ mode: 'ask' })
      expect(policy.isAllowed('file_upload')).toBe(false)
      expect(policy.needsConfirmation('file_upload')).toBe(true)
    })

    it('should handle destructive_click action', () => {
      const policy = createDestructivePolicy({ mode: 'ask' })
      expect(policy.isAllowed('destructive_click')).toBe(false)
      expect(policy.needsConfirmation('destructive_click')).toBe(true)
    })

    it('should handle custom action string', () => {
      const policy = createDestructivePolicy({ mode: 'allow' })
      expect(policy.isAllowed('delete_account')).toBe(true)
    })

    it('should allow all actions in allow mode', () => {
      const policy = createDestructivePolicy({ mode: 'allow' })
      expect(policy.isAllowed('form_submit')).toBe(true)
      expect(policy.isAllowed('file_upload')).toBe(true)
      expect(policy.isAllowed('destructive_click')).toBe(true)
    })
  })
})
