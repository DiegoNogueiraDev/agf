/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §node_286e95d3c58f — Tests for getBlastRadiusTestFiles pure BFS function
 * AC: GIVEN blast-radius module WHEN getBlastRadiusTestFiles called THEN returns correct test file set
 */
import { describe, it, expect } from 'vitest'
import { getBlastRadiusTestFiles } from '../core/code/blast-radius.js'
import type { CodeSymbol, CodeRelation } from '../core/code/code-types.js'

function sym(id: string, file: string): CodeSymbol {
  return {
    id,
    file,
    kind: 'function',
    name: id,
    projectId: 'test',
    startLine: 1,
    endLine: 1,
    exported: true,
    indexedAt: '2026-01-01T00:00:00Z',
  } as CodeSymbol
}

function rel(fromSymbol: string, toSymbol: string): CodeRelation {
  return {
    id: `${fromSymbol}->${toSymbol}`,
    fromSymbol,
    toSymbol,
    type: 'imports',
    projectId: 'test',
    indexedAt: '2026-01-01T00:00:00Z',
  } as CodeRelation
}

describe('getBlastRadiusTestFiles', () => {
  it('returns empty set when no changed files', () => {
    const result = getBlastRadiusTestFiles([], [], [])
    expect(result.size).toBe(0)
  })

  it('returns empty set when no symbols or relations', () => {
    const result = getBlastRadiusTestFiles([], [], ['src/foo.ts'])
    expect(result.size).toBe(0)
  })

  it('returns test file that directly imports changed file symbol', () => {
    const symbols = [sym('foo', 'src/foo.ts'), sym('fooTest', 'src/tests/foo.test.ts')]
    const relations = [rel('fooTest', 'foo')]
    const result = getBlastRadiusTestFiles(symbols, relations, ['src/foo.ts'])
    expect(result.has('src/tests/foo.test.ts')).toBe(true)
  })

  it('follows transitive import chain to reach test file', () => {
    const symbols = [sym('core', 'src/core.ts'), sym('mid', 'src/mid.ts'), sym('testFile', 'src/tests/core.test.ts')]
    const relations = [rel('mid', 'core'), rel('testFile', 'mid')]
    const result = getBlastRadiusTestFiles(symbols, relations, ['src/core.ts'])
    expect(result.has('src/tests/core.test.ts')).toBe(true)
  })

  it('does not include non-test files in result', () => {
    const symbols = [sym('a', 'src/a.ts'), sym('b', 'src/b.ts')]
    const relations = [rel('b', 'a')]
    const result = getBlastRadiusTestFiles(symbols, relations, ['src/a.ts'])
    expect(result.has('src/b.ts')).toBe(false)
  })

  it('handles multiple changed files', () => {
    const symbols = [
      sym('x', 'src/x.ts'),
      sym('y', 'src/y.ts'),
      sym('xTest', 'src/tests/x.test.ts'),
      sym('yTest', 'src/tests/y.test.ts'),
    ]
    const relations = [rel('xTest', 'x'), rel('yTest', 'y')]
    const result = getBlastRadiusTestFiles(symbols, relations, ['src/x.ts', 'src/y.ts'])
    expect(result.has('src/tests/x.test.ts')).toBe(true)
    expect(result.has('src/tests/y.test.ts')).toBe(true)
  })

  it('avoids cycles in the graph', () => {
    const symbols = [sym('a', 'src/a.ts'), sym('b', 'src/b.ts'), sym('t', 'src/tests/a.test.ts')]
    const relations = [rel('b', 'a'), rel('a', 'b'), rel('t', 'a')]
    const result = getBlastRadiusTestFiles(symbols, relations, ['src/a.ts'])
    expect(result instanceof Set).toBe(true)
    expect(result.has('src/tests/a.test.ts')).toBe(true)
  })
})
