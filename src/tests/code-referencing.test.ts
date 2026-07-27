import { describe, it, expect, vi } from 'vitest'
import { findReferencingSymbols } from '../core/code/code-referencing.js'
import type { CodeStore } from '../core/code/code-store.js'
import type { CodeSymbol } from '../core/code/code-types.js'

const NOW = '2026-06-23T00:00:00.000Z'

function makeSymbol(overrides?: Partial<CodeSymbol>): CodeSymbol {
  return {
    id: 's1',
    projectId: 'proj',
    name: 'myFunction',
    kind: 'function',
    file: 'src/foo.ts',
    startLine: 1,
    endLine: 10,
    exported: true,
    indexedAt: NOW,
    ...overrides,
  }
}

function makeStore(
  symbols: CodeSymbol[] = [],
  refRows: Array<{ ref_file: string; ref_line: number; snippet?: string }> = [],
): CodeStore {
  return {
    findSymbolsByName: vi.fn().mockReturnValue(symbols),
    getReferencingRows: vi.fn().mockReturnValue(refRows),
  } as unknown as CodeStore
}

describe('findReferencingSymbols', () => {
  it('returns empty array when symbol not found', () => {
    const store = makeStore([])
    const result = findReferencingSymbols(store, 'unknown', 'proj')
    expect(result).toEqual([])
  })

  it('does not call getReferencingRows when no symbols found', () => {
    const store = makeStore([])
    findReferencingSymbols(store, 'unknown', 'proj')
    expect(store.getReferencingRows as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
  })

  it('returns references when symbol exists', () => {
    const sym = makeSymbol()
    const rows = [{ ref_file: 'src/bar.ts', ref_line: 5, snippet: 'myFunction()' }]
    const store = makeStore([sym], rows)
    const result = findReferencingSymbols(store, 'myFunction', 'proj')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ file: 'src/bar.ts', line: 5, snippet: 'myFunction()' })
  })

  it('handles missing snippet gracefully', () => {
    const sym = makeSymbol()
    const rows = [{ ref_file: 'src/bar.ts', ref_line: 5 }]
    const store = makeStore([sym], rows)
    const result = findReferencingSymbols(store, 'myFunction', 'proj')
    expect(result[0].snippet).toBe('')
  })

  it('passes projectId to findSymbolsByName', () => {
    const store = makeStore([])
    findReferencingSymbols(store, 'fn', 'my-project')
    expect(store.findSymbolsByName as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('fn', 'my-project')
  })

  it('maps scope "project" to undefined (project-wide search)', () => {
    const sym = makeSymbol()
    const store = makeStore([sym], [])
    findReferencingSymbols(store, 'myFunction', 'proj', 'project')
    expect(store.getReferencingRows as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.any(Array),
      'proj',
      undefined,
    )
  })

  it('passes non-project scope directly', () => {
    const sym = makeSymbol()
    const store = makeStore([sym], [])
    findReferencingSymbols(store, 'myFunction', 'proj', 'src/utils.ts')
    expect(store.getReferencingRows as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.any(Array),
      'proj',
      'src/utils.ts',
    )
  })
})
