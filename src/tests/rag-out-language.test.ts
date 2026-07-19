import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { languageFromExtension, detectProjectLanguage } from '../core/rag-out/language.js'
import { decideScaffold, type ScaffoldDescriptor } from '../core/rag-out/gate.js'

describe('languageFromExtension', () => {
  it('maps common extensions to languages', () => {
    expect(languageFromExtension('a/b.ts')).toBe('typescript')
    expect(languageFromExtension('main.py')).toBe('python')
    expect(languageFromExtension('cmd/main.go')).toBe('go')
    expect(languageFromExtension('lib.rs')).toBe('rust')
    expect(languageFromExtension('README.md')).toBeNull()
  })
})

describe('detectProjectLanguage', () => {
  let tmp: string
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'agf-lang-'))
  })
  afterEach(() => rmSync(tmp, { recursive: true, force: true }))

  it('detects the dominant language by file count', () => {
    mkdirSync(join(tmp, 'src'), { recursive: true })
    writeFileSync(join(tmp, 'src', 'a.py'), 'def f(): pass')
    writeFileSync(join(tmp, 'src', 'b.py'), 'def g(): pass')
    writeFileSync(join(tmp, 'src', 'c.ts'), 'export const x = 1')
    expect(detectProjectLanguage(tmp)).toBe('python')
  })

  it('returns unknown for an empty / sourceless project', () => {
    expect(detectProjectLanguage(tmp)).toBe('unknown')
  })

  it('ignores node_modules and build dirs', () => {
    mkdirSync(join(tmp, 'node_modules', 'x'), { recursive: true })
    writeFileSync(join(tmp, 'node_modules', 'x', 'huge.py'), 'x=1')
    writeFileSync(join(tmp, 'index.ts'), 'export const y = 2')
    expect(detectProjectLanguage(tmp)).toBe('typescript')
  })
})

describe('decideScaffold — language guard', () => {
  const corpus: ScaffoldDescriptor[] = [
    {
      id: 'contract',
      goal: 'REST handler with zod validation',
      fitTags: ['rest', 'handler', 'http', 'zod', 'validation', 'endpoint'],
      slots: ['route', 'method', 'requestSchema'],
      noveltyFloor: 0.5,
      language: 'typescript',
    },
  ]

  it('recovers when project language matches the scaffold', () => {
    const d = decideScaffold('build a REST endpoint handler with validation', corpus, { projectLanguage: 'typescript' })
    expect(d.decision).toBe('recover')
  })

  it('generates (never recovers wrong-language) when project language differs', () => {
    const d = decideScaffold('build a REST endpoint handler with validation', corpus, { projectLanguage: 'python' })
    expect(d.decision).toBe('generate')
    expect(d.reason).toMatch(/language/i)
  })

  it('falls back to fit-only behavior when projectLanguage is unknown/omitted', () => {
    const d = decideScaffold('build a REST endpoint handler with validation', corpus, { projectLanguage: 'unknown' })
    expect(d.decision).toBe('recover')
  })
})
