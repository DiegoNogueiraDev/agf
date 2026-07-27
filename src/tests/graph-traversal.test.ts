import { describe, it, expect, vi } from 'vitest'
import { getSymbolContext, analyzeImpact, getFullGraph } from '../core/code/graph-traversal.js'
import type { CodeStore } from '../core/code/code-store.js'
import type { CodeSymbol, CodeRelation } from '../core/code/code-types.js'

const NOW = '2026-06-23T00:00:00.000Z'

function makeSymbol(overrides?: Partial<CodeSymbol>): CodeSymbol {
  return {
    id: 's1',
    projectId: 'proj',
    name: 'myFn',
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

function makeStore(overrides?: {
  symbols?: CodeSymbol[]
  relationsFrom?: CodeRelation[]
  relationsTo?: CodeRelation[]
  symbol?: CodeSymbol | null
  allSymbols?: CodeSymbol[]
  allRelations?: CodeRelation[]
}): CodeStore {
  return {
    findSymbolsByName: vi.fn().mockReturnValue(overrides?.symbols ?? []),
    getRelationsFrom: vi.fn().mockReturnValue(overrides?.relationsFrom ?? []),
    getRelationsTo: vi.fn().mockReturnValue(overrides?.relationsTo ?? []),
    getSymbol: vi.fn().mockReturnValue(overrides?.symbol ?? null),
    getAllSymbols: vi.fn().mockReturnValue(overrides?.allSymbols ?? []),
    getAllRelations: vi.fn().mockReturnValue(overrides?.allRelations ?? []),
    countSymbols: vi.fn().mockReturnValue(overrides?.allSymbols?.length ?? 0),
    countRelations: vi.fn().mockReturnValue(overrides?.allRelations?.length ?? 0),
  } as unknown as CodeStore
}

describe('getSymbolContext', () => {
  it('returns empty result when symbol not found', () => {
    const store = makeStore()
    const result = getSymbolContext(store, 'unknown', 'proj')
    expect(result.symbols).toEqual([])
    expect(result.relations).toEqual([])
  })

  it('includes the target symbol', () => {
    const sym = makeSymbol()
    const store = makeStore({ symbols: [sym] })
    const result = getSymbolContext(store, 'myFn', 'proj')
    expect(result.symbols.some((s) => s.id === 's1')).toBe(true)
  })

  it('includes outgoing relations', () => {
    const sym = makeSymbol()
    const rel = makeRelation()
    const store = makeStore({ symbols: [sym], relationsFrom: [rel] })
    const result = getSymbolContext(store, 'myFn', 'proj')
    expect(result.relations.some((r) => r.id === 'r1')).toBe(true)
  })

  it('includes incoming relations', () => {
    const sym = makeSymbol()
    const rel = makeRelation({ id: 'r2', fromSymbol: 's3', toSymbol: 's1' })
    const store = makeStore({ symbols: [sym], relationsTo: [rel] })
    const result = getSymbolContext(store, 'myFn', 'proj')
    expect(result.relations.some((r) => r.id === 'r2')).toBe(true)
  })
})

describe('analyzeImpact', () => {
  it('returns empty result when symbol not found', () => {
    const store = makeStore()
    const result = analyzeImpact(store, 'unknown', 'proj', 'downstream')
    expect(result.affectedSymbols).toEqual([])
  })

  it('returns ImpactResult shape', () => {
    const store = makeStore()
    const result = analyzeImpact(store, 'unknown', 'proj', 'upstream')
    expect(result).toHaveProperty('affectedSymbols')
    expect(result).toHaveProperty('riskLevel')
    expect(result).toHaveProperty('symbol')
  })
})

describe('getFullGraph', () => {
  it('returns all symbols and relations', () => {
    const sym = makeSymbol()
    const rel = makeRelation()
    const store = makeStore({ allSymbols: [sym], allRelations: [rel] })
    const result = getFullGraph(store, 'proj')
    expect(result.symbols).toHaveLength(1)
    expect(result.relations).toHaveLength(1)
  })

  it('returns empty graph when store has no data', () => {
    const store = makeStore()
    const result = getFullGraph(store, 'proj')
    expect(result.symbols).toEqual([])
    expect(result.relations).toEqual([])
  })
})
