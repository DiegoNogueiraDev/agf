import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { analyzeFile, isTypeScriptAvailable, resetTypeScriptLoader } from '../core/code/ts-analyzer.js'

/**
 * Characterization tests for ts-analyzer: symbol/relation extraction from real
 * .ts files on disk, relative-path + 1-based line correctness, and the lazy
 * typescript loader availability/reset behavior.
 */

let dir: string

function writeTs(name: string, content: string): string {
  const file = path.join(dir, name)
  writeFileSync(file, content, 'utf-8')
  return file
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'ts-analyzer-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('analyzeFile symbol + relation extraction', () => {
  it('extracts a class and its method, and captures the import relation', async () => {
    const file = writeTs(
      'foo.ts',
      `import { helper } from './helper'\nexport class Foo {\n  bar() {\n    helper()\n  }\n}\n`,
    )
    const result = await analyzeFile(file, dir)

    const fooClass = result.symbols.find((s) => s.name === 'Foo')
    expect(fooClass?.kind).toBe('class')
    expect(fooClass?.exported).toBe(true)

    const barMethod = result.symbols.find((s) => s.name === 'bar')
    expect(barMethod?.kind).toBe('method')

    const importRel = result.relations.find((r) => r.type === 'imports' && r.toSymbol === 'helper')
    expect(importRel).toBeDefined()
    expect(importRel?.metadata).toMatchObject({ modulePath: './helper' })
  })

  it('makes symbol file paths relative to basePath with correct 1-based lines', async () => {
    const file = writeTs('sample.ts', `\nexport function alpha() {\n  return 1\n}\n`)
    const result = await analyzeFile(file, dir)

    expect(result.file).toBe('sample.ts')
    const alpha = result.symbols.find((s) => s.name === 'alpha')
    expect(alpha?.file).toBe('sample.ts')
    // `export function alpha` is on the 2nd line → 1-based startLine === 2
    expect(alpha?.startLine).toBe(2)
  })

  it('returns empty symbols/relations for an empty file (no throw)', async () => {
    const file = writeTs('empty.ts', '')
    const result = await analyzeFile(file, dir)
    expect(result.symbols).toEqual([])
    expect(result.relations).toEqual([])
  })
})

describe('typescript lazy loader', () => {
  beforeEach(() => resetTypeScriptLoader())

  it('isTypeScriptAvailable() is true when typescript is installed', async () => {
    expect(await isTypeScriptAvailable()).toBe(true)
  })

  it('re-resolves cleanly after resetTypeScriptLoader()', async () => {
    expect(await isTypeScriptAvailable()).toBe(true)
    resetTypeScriptLoader()
    expect(await isTypeScriptAvailable()).toBe(true)
  })
})
