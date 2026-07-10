import { describe, it, expect } from 'vitest'
import { languageFromExtension } from '../core/rag-out/language.js'

describe('languageFromExtension', () => {
  it('detects TypeScript from .ts extension', () => {
    expect(languageFromExtension('src/main.ts')).toBe('typescript')
  })

  it('detects TypeScript from .tsx extension', () => {
    expect(languageFromExtension('src/App.tsx')).toBe('typescript')
  })

  it('detects JavaScript from .js', () => {
    expect(languageFromExtension('index.js')).toBe('javascript')
  })

  it('detects Python from .py', () => {
    expect(languageFromExtension('main.py')).toBe('python')
  })

  it('detects Go from .go', () => {
    expect(languageFromExtension('main.go')).toBe('go')
  })

  it('detects Rust from .rs', () => {
    expect(languageFromExtension('lib.rs')).toBe('rust')
  })

  it('detects Java from .java', () => {
    expect(languageFromExtension('Main.java')).toBe('java')
  })

  it('returns null for unknown extensions', () => {
    expect(languageFromExtension('file.xyz')).toBeNull()
  })

  it('returns null for no extension', () => {
    expect(languageFromExtension('Makefile')).toBeNull()
  })

  it('handles full paths', () => {
    const result = languageFromExtension('/home/user/project/src/core/utils.ts')
    expect(result).toBe('typescript')
  })
})
