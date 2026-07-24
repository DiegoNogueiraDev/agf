/*!
 * Task node_90e2a80d129a — ServerRegistry tests.
 *
 * AC1: getConfigForLanguage for supported language → returns config.
 * AC1: getConfigForLanguage for unknown language → undefined, no throw.
 */

import { describe, it, expect } from 'vitest'
import { ServerRegistry } from '../core/lsp/server-registry.js'

describe('ServerRegistry', () => {
  it('returns config for a supported language', () => {
    const registry = new ServerRegistry()
    const config = registry.getConfigForLanguage('typescript')
    expect(config).toBeDefined()
    expect(config?.languageId).toBe('typescript')
    expect(typeof config?.command).toBe('string')
  })

  it('returns undefined for an unknown language without throwing', () => {
    const registry = new ServerRegistry()
    expect(() => registry.getConfigForLanguage('cobol')).not.toThrow()
    expect(registry.getConfigForLanguage('cobol')).toBeUndefined()
  })

  it('resolves language for a known extension (no leading dot)', () => {
    const registry = new ServerRegistry()
    const lang = registry.getLanguageForExtension('ts')
    expect(lang).toBe('typescript')
  })

  it('returns undefined for unknown extension', () => {
    const registry = new ServerRegistry()
    expect(registry.getLanguageForExtension('xyz')).toBeUndefined()
  })

  it('lists all configs', () => {
    const registry = new ServerRegistry()
    const all = registry.getAllConfigs()
    expect(Array.isArray(all)).toBe(true)
    expect(all.length).toBeGreaterThan(0)
  })
})
