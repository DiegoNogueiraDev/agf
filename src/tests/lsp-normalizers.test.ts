/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_905906d2f12f — lsp-normalizers.ts had zero test coverage despite
 * being the pure normalization layer LspBridge delegates to (extracted from
 * the bridge specifically to be independently testable).
 */

import { describe, it, expect } from 'vitest'
import {
  fromFileUri,
  normalizeLocation,
  normalizeHover,
  normalizeWorkspaceEdit,
  normalizeCallHierarchyItem,
  normalizeDocumentSymbol,
  SYMBOL_KIND_MAP,
  type RawLspLocation,
  type RawLspWorkspaceEdit,
  type RawCallHierarchyItem,
  type RawDocumentSymbol,
} from '../core/lsp/lsp-normalizers.js'

const BASE = '/repo'

describe('fromFileUri', () => {
  it('strips the file:// prefix and returns a path relative to basePath', () => {
    expect(fromFileUri('file:///repo/src/a.ts', BASE)).toBe('src/a.ts')
  })

  it('decodes percent-encoded characters in the URI', () => {
    expect(fromFileUri('file:///repo/src/a%20b.ts', BASE)).toBe('src/a b.ts')
  })
})

describe('normalizeLocation', () => {
  it('converts a raw LSP location to 1-indexed lines, 0-indexed characters', () => {
    const raw: RawLspLocation = {
      uri: 'file:///repo/src/a.ts',
      range: { start: { line: 4, character: 2 }, end: { line: 6, character: 10 } },
    }
    expect(normalizeLocation(raw, BASE)).toEqual({
      file: 'src/a.ts',
      startLine: 5,
      startCharacter: 2,
      endLine: 7,
      endCharacter: 10,
    })
  })

  it('returns an empty-shaped location when raw is falsy', () => {
    expect(normalizeLocation(null as unknown as RawLspLocation, BASE)).toEqual({
      file: '',
      startLine: 0,
      startCharacter: 0,
      endLine: 0,
      endCharacter: 0,
    })
  })
})

describe('normalizeHover', () => {
  it('wraps a plain string as the signature', () => {
    expect(normalizeHover({ contents: 'const x: number' })).toEqual({ signature: 'const x: number' })
  })

  it('extracts signature+language from a single markdown-kind object', () => {
    const result = normalizeHover({ contents: { kind: 'markdown', value: '```ts\nconst x\n```' } })
    expect(result.signature).toBe('```ts\nconst x\n```')
    expect(result.language).toBe('markdown')
  })

  it('does not set language for a non-markdown kind object', () => {
    const result = normalizeHover({ contents: { kind: 'plaintext', value: 'plain text' } })
    expect(result.language).toBeUndefined()
  })

  it('joins array contents: first part is signature, rest becomes documentation', () => {
    const result = normalizeHover({ contents: ['const x: number', 'A documented constant.'] })
    expect(result.signature).toBe('const x: number')
    expect(result.documentation).toBe('A documented constant.')
  })

  it('returns empty signature when raw is falsy', () => {
    expect(normalizeHover(null as unknown as { contents: string })).toEqual({ signature: '' })
  })
})

describe('normalizeWorkspaceEdit', () => {
  it('flattens the changes map into a single LspTextEdit list', () => {
    const raw: RawLspWorkspaceEdit = {
      changes: {
        'file:///repo/src/a.ts': [
          { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }, newText: 'foo' },
        ],
      },
    }
    const result = normalizeWorkspaceEdit(raw, BASE)
    expect(result.changes).toHaveLength(1)
    expect(result.changes[0]).toEqual({
      file: 'src/a.ts',
      startLine: 1,
      startCharacter: 0,
      endLine: 1,
      endCharacter: 3,
      newText: 'foo',
    })
  })

  it('flattens documentChanges into the same LspTextEdit shape', () => {
    const raw: RawLspWorkspaceEdit = {
      documentChanges: [
        {
          textDocument: { uri: 'file:///repo/src/b.ts' },
          edits: [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } }, newText: 'bar' }],
        },
      ],
    }
    const result = normalizeWorkspaceEdit(raw, BASE)
    expect(result.changes).toEqual([
      { file: 'src/b.ts', startLine: 2, startCharacter: 0, endLine: 2, endCharacter: 5, newText: 'bar' },
    ])
  })

  it('returns an empty changes array when raw is falsy', () => {
    expect(normalizeWorkspaceEdit(null as unknown as RawLspWorkspaceEdit, BASE)).toEqual({ changes: [] })
  })
})

describe('normalizeCallHierarchyItem', () => {
  it('maps a numeric kind to its readable SYMBOL_KIND_MAP name', () => {
    const raw: RawCallHierarchyItem = {
      name: 'myFunction',
      kind: 12,
      uri: 'file:///repo/src/a.ts',
      range: { start: { line: 9, character: 0 }, end: { line: 12, character: 1 } },
    }
    const result = normalizeCallHierarchyItem(raw, BASE)
    expect(result).toEqual({ name: 'myFunction', kind: 'Function', file: 'src/a.ts', startLine: 10, endLine: 13 })
  })

  it('falls back to Unknown(n) for an unmapped kind number', () => {
    const raw: RawCallHierarchyItem = {
      name: 'x',
      kind: 999,
      uri: 'file:///repo/src/a.ts',
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
    }
    expect(normalizeCallHierarchyItem(raw, BASE).kind).toBe('Unknown(999)')
  })

  it('returns an empty-shaped item when raw is falsy', () => {
    expect(normalizeCallHierarchyItem(null as unknown as RawCallHierarchyItem, BASE)).toEqual({
      name: '',
      kind: 'Unknown',
      file: '',
      startLine: 0,
      endLine: 0,
    })
  })
})

describe('normalizeDocumentSymbol', () => {
  it('maps a leaf symbol with no children', () => {
    const raw: RawDocumentSymbol = {
      name: 'MyClass',
      kind: 5,
      range: { start: { line: 0, character: 0 }, end: { line: 20, character: 1 } },
    }
    const result = normalizeDocumentSymbol('src/a.ts', raw)
    expect(result).toEqual({ name: 'MyClass', kind: 'Class', file: 'src/a.ts', startLine: 1, endLine: 21 })
    expect(result.children).toBeUndefined()
  })

  it('recursively normalizes nested children, inheriting the parent file', () => {
    const raw: RawDocumentSymbol = {
      name: 'MyClass',
      kind: 5,
      range: { start: { line: 0, character: 0 }, end: { line: 20, character: 1 } },
      children: [
        { name: 'myMethod', kind: 6, range: { start: { line: 1, character: 2 }, end: { line: 3, character: 3 } } },
      ],
    }
    const result = normalizeDocumentSymbol('src/a.ts', raw)
    expect(result.children).toHaveLength(1)
    expect(result.children![0]).toEqual({
      name: 'myMethod',
      kind: 'Method',
      file: 'src/a.ts',
      startLine: 2,
      endLine: 4,
    })
  })

  it('does not set children for an empty children array', () => {
    const raw: RawDocumentSymbol = {
      name: 'MyClass',
      kind: 5,
      range: { start: { line: 0, character: 0 }, end: { line: 20, character: 1 } },
      children: [],
    }
    expect(normalizeDocumentSymbol('src/a.ts', raw).children).toBeUndefined()
  })

  it('returns an empty-shaped symbol when raw is falsy', () => {
    expect(normalizeDocumentSymbol('src/a.ts', null as unknown as RawDocumentSymbol)).toEqual({
      name: '',
      kind: 'Unknown',
      file: 'src/a.ts',
      startLine: 0,
      endLine: 0,
    })
  })
})

describe('SYMBOL_KIND_MAP', () => {
  it('covers the full LSP SymbolKind spec range (1-26)', () => {
    for (let i = 1; i <= 26; i++) {
      expect(SYMBOL_KIND_MAP[i]).toBeTypeOf('string')
    }
  })
})
