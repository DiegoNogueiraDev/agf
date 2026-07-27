import { describe, it, expect, vi } from 'vitest'
import { detectProcesses } from '../core/code/process-detector.js'
import type { CodeStore } from '../core/code/code-store.js'
import type { CodeSymbol, CodeRelation } from '../core/code/code-types.js'

const NOW = '2026-06-23T00:00:00.000Z'

function makeSymbol(overrides?: Partial<CodeSymbol>): CodeSymbol {
  return {
    id: 's1',
    projectId: 'proj',
    name: 'entryFn',
    kind: 'function',
    file: 'src/foo.ts',
    startLine: 1,
    endLine: 10,
    exported: true,
    indexedAt: NOW,
    ...overrides,
  }
}

function makeRelation(overrides?: Partial<CodeRelation>): CodeRelation {
  return {
    id: 'r1',
    projectId: 'proj',
    fromSymbol: 's1',
    toSymbol: 's2',
    type: 'calls',
    indexedAt: NOW,
    ...overrides,
  }
}

function makeStore(symbols: CodeSymbol[] = [], relations: CodeRelation[] = []): CodeStore {
  const symbolMap = new Map(symbols.map((s) => [s.id, s]))
  return {
    getAllSymbols: vi.fn().mockReturnValue(symbols),
    getAllRelations: vi.fn().mockReturnValue(relations),
    getSymbol: vi.fn((id: string) => symbolMap.get(id) ?? null),
  } as unknown as CodeStore
}

describe('detectProcesses', () => {
  it('returns empty array for empty store', () => {
    const store = makeStore()
    const result = detectProcesses(store, 'proj')
    expect(result).toEqual([])
  })

  it('detects exported function with no callers as entry point', () => {
    const sym = makeSymbol({ id: 's1', exported: true, kind: 'function', name: 'entryFn' })
    const store = makeStore([sym], [])
    const result = detectProcesses(store, 'proj')
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].entryPoint).toBe('entryFn')
  })

  it('does not flag non-exported functions as entry points', () => {
    const sym = makeSymbol({ id: 's1', exported: false, kind: 'function' })
    const store = makeStore([sym], [])
    const result = detectProcesses(store, 'proj')
    expect(result).toEqual([])
  })

  it('does not flag symbol that is called by another as entry point', () => {
    const sym1 = makeSymbol({ id: 's1', exported: true, kind: 'function', name: 'fn1' })
    const sym2 = makeSymbol({ id: 's2', exported: true, kind: 'function', name: 'fn2' })
    const rel = makeRelation({ fromSymbol: 's1', toSymbol: 's2', type: 'calls' })
    const store = makeStore([sym1, sym2], [rel])
    const result = detectProcesses(store, 'proj')
    // s2 is a callee so not an entry — only s1 should be detected
    const names = result.map((p) => p.entryPoint)
    expect(names).toContain('fn1')
    expect(names).not.toContain('fn2')
  })

  it('returns DetectedProcess objects with chain', () => {
    const sym = makeSymbol({ id: 's1', exported: true, kind: 'function' })
    const store = makeStore([sym], [])
    const result = detectProcesses(store, 'proj')
    expect(result[0]).toHaveProperty('entryPoint')
    expect(result[0]).toHaveProperty('entryFile')
    expect(result[0]).toHaveProperty('chain')
  })
})
