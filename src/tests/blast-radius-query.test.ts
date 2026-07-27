import { describe, it, expect } from 'vitest'
import { getBlastRadiusTestFiles } from '../core/code/blast-radius.js'
import type { CodeSymbol, CodeRelation } from '../core/code/code-types.js'

const NOW = '2026-01-01T00:00:00Z'

function sym(id: string, file: string, name = id): CodeSymbol {
  return {
    id,
    name,
    kind: 'function',
    file,
    startLine: 1,
    endLine: 10,
    exported: true,
    projectId: 'proj',
    indexedAt: NOW,
  } as CodeSymbol
}

function rel(fromSymbol: string, toSymbol: string): CodeRelation {
  return {
    id: `${fromSymbol}->${toSymbol}`,
    fromSymbol,
    toSymbol,
    type: 'imports',
    projectId: 'proj',
    indexedAt: NOW,
  } as CodeRelation
}

describe('getBlastRadiusTestFiles', () => {
  it('returns empty set when no changed files given', () => {
    const symbols: CodeSymbol[] = [sym('a', 'src/core/foo.ts')]
    const result = getBlastRadiusTestFiles(symbols, [], [])
    expect(result.size).toBe(0)
  })

  it('returns test file that directly imports a changed file', () => {
    const symbols: CodeSymbol[] = [
      sym('foo-fn', 'src/core/foo.ts', 'fooFn'),
      sym('test-fn', 'src/tests/foo.test.ts', 'testFooFn'),
    ]
    // test imports foo
    const relations: CodeRelation[] = [rel('test-fn', 'foo-fn')]
    const result = getBlastRadiusTestFiles(symbols, relations, ['src/core/foo.ts'])
    expect(result.has('src/tests/foo.test.ts')).toBe(true)
    expect(result.size).toBe(1)
  })

  it('transitively finds test files two hops away', () => {
    const symbols: CodeSymbol[] = [
      sym('a', 'src/core/a.ts'),
      sym('b', 'src/core/b.ts'),
      sym('t', 'src/tests/b.test.ts'),
    ]
    // t imports b; b imports a; change a → should find t
    const relations: CodeRelation[] = [rel('t', 'b'), rel('b', 'a')]
    const result = getBlastRadiusTestFiles(symbols, relations, ['src/core/a.ts'])
    expect(result.has('src/tests/b.test.ts')).toBe(true)
  })

  it('does not include non-test files in result', () => {
    const symbols: CodeSymbol[] = [
      sym('a', 'src/core/a.ts'),
      sym('b', 'src/core/b.ts'),
      sym('t', 'src/tests/a.test.ts'),
    ]
    const relations: CodeRelation[] = [rel('b', 'a'), rel('t', 'a')]
    const result = getBlastRadiusTestFiles(symbols, relations, ['src/core/a.ts'])
    expect([...result].every((f) => f.includes('.test.'))).toBe(true)
  })

  it('returns empty when changed file has no dependents', () => {
    const symbols: CodeSymbol[] = [sym('a', 'src/core/a.ts')]
    const result = getBlastRadiusTestFiles(symbols, [], ['src/core/a.ts'])
    expect(result.size).toBe(0)
  })

  it('does not mutate input arrays', () => {
    const symbols: CodeSymbol[] = [sym('a', 'src/core/a.ts')]
    const relations: CodeRelation[] = []
    const changedFiles = ['src/core/a.ts']
    const origLen = changedFiles.length
    getBlastRadiusTestFiles(symbols, relations, changedFiles)
    expect(changedFiles.length).toBe(origLen)
  })
})
