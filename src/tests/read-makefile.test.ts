import { describe, it, expect } from 'vitest'
import { parseMakefile } from '../core/parser/read-makefile.js'

describe('parseMakefile', () => {
  it('returns empty entries for empty content', () => {
    const result = parseMakefile('')
    expect(result.entries).toHaveLength(0)
  })

  it('parses a simple target with no deps', () => {
    const content = 'all:\n\techo done'
    const result = parseMakefile(content)
    const entry = result.entries.find((e) => e.target === 'all')
    expect(entry).toBeDefined()
    expect(entry?.deps).toHaveLength(0)
    expect(entry?.isPhony).toBe(false)
  })

  it('parses a target with dependencies', () => {
    const content = 'build: src/main.c src/util.c\n\tgcc -o build src/main.c src/util.c'
    const result = parseMakefile(content)
    const entry = result.entries.find((e) => e.target === 'build')
    expect(entry?.deps).toContain('src/main.c')
    expect(entry?.deps).toContain('src/util.c')
  })

  it('marks phony targets from .PHONY declaration', () => {
    const content = '.PHONY: clean test\nclean:\n\trm -rf dist\ntest:\n\tvitest'
    const result = parseMakefile(content)
    const clean = result.entries.find((e) => e.target === 'clean')
    const test = result.entries.find((e) => e.target === 'test')
    expect(clean?.isPhony).toBe(true)
    expect(test?.isPhony).toBe(true)
  })

  it('non-phony targets have isPhony false', () => {
    const content = 'dist/app.js: src/app.ts\n\ttsc'
    const result = parseMakefile(content)
    const entry = result.entries.find((e) => e.target === 'dist/app.js')
    expect(entry?.isPhony).toBe(false)
  })

  it('preserves raw content', () => {
    const content = 'all:\n\techo hi'
    const result = parseMakefile(content)
    expect(result.raw).toBe(content)
  })

  it('parses multiple targets', () => {
    const content = 'build:\n\techo b\ntest:\n\techo t\nclean:\n\techo c'
    const result = parseMakefile(content)
    expect(result.entries.length).toBeGreaterThanOrEqual(3)
  })
})
