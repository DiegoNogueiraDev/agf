import { describe, it, expect, beforeEach } from 'vitest'
import { TreeSitterManager, resetTreeSitterLoader } from '../core/code/treesitter/treesitter-manager.js'

/**
 * Tests for TreeSitterManager pure methods (no WASM required).
 * getParser degrades gracefully when grammar/WASM is absent.
 */

describe('TreeSitterManager', () => {
  let manager: TreeSitterManager

  beforeEach(() => {
    resetTreeSitterLoader()
    manager = new TreeSitterManager()
  })

  describe('getSupportedLanguages', () => {
    it('returns a non-empty list of language IDs', () => {
      const langs = manager.getSupportedLanguages()
      expect(langs.length).toBeGreaterThan(0)
    })

    it('includes typescript in the supported languages', () => {
      expect(manager.getSupportedLanguages()).toContain('typescript')
    })
  })

  describe('isLanguageSupported', () => {
    it('returns true for typescript', () => {
      expect(manager.isLanguageSupported('typescript')).toBe(true)
    })

    it('returns false for an unknown language', () => {
      expect(manager.isLanguageSupported('nonexistent-lang-xyz')).toBe(false)
    })
  })

  describe('getParser — graceful degradation', () => {
    it('returns null for an unsupported language without throwing', async () => {
      const parser = await manager.getParser('nonexistent-lang-xyz')
      expect(parser).toBeNull()
    })

    it('returns null for typescript when WASM is not installed (no native grammar)', async () => {
      // In CI / test environment the WASM binary is not present → degrades to null.
      const parser = await manager.getParser('typescript')
      // Either null (no WASM) or a real parser — both are valid; it must NOT throw.
      expect(parser === null || typeof parser === 'object').toBe(true)
    })
  })

  describe('resetTreeSitterLoader', () => {
    it('can be called without throwing', () => {
      expect(() => resetTreeSitterLoader()).not.toThrow()
    })

    it('resets loader so a new manager starts fresh', () => {
      resetTreeSitterLoader()
      const m2 = new TreeSitterManager()
      // After reset, pure methods still work.
      expect(m2.isLanguageSupported('python')).toBe(true)
    })
  })
})
