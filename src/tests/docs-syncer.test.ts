/*!
 * Tests for docs/docs-syncer.ts — DocsSyncer.syncLib and syncAll.
 *
 * DocsSyncer(cacheStore, fetcher) is dependency-injected: both cacheStore
 * and fetcher are passed as constructor params, making them stubbable via
 * vi.fn() without touching DB or network.
 *
 * syncLib(libName): resolves libId → fetches content → upserts into cache
 * syncAll(): getStaleLibs(ONE_DAY_MS) → syncLib each → collect results
 *
 * Covers: resolveLibraryId call arg, queryDocs call arg, upsertDoc call args,
 * return value from upsertDoc, stale lib iteration, error isolation in syncAll,
 * empty stale list, ONE_DAY_MS constant passed to getStaleLibs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DocsSyncer } from '../core/docs/docs-syncer.js'
import type { CachedDoc } from '../core/docs/docs-cache-store.js'
import type { DocsCacheStore } from '../core/docs/docs-cache-store.js'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeDoc(overrides: Partial<CachedDoc> = {}): CachedDoc {
  return {
    id: 1,
    libId: 'react@latest',
    libName: 'react',
    version: null,
    content: 'React docs',
    fetchedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeMocks() {
  const cacheStore = {
    upsertDoc: vi.fn().mockReturnValue(makeDoc()),
    getStaleLibs: vi.fn().mockReturnValue([]),
    getDoc: vi.fn().mockReturnValue(null),
    searchDocs: vi.fn().mockReturnValue([]),
    listCached: vi.fn().mockReturnValue([]),
  } as unknown as DocsCacheStore

  const fetcher = {
    resolveLibraryId: vi.fn().mockResolvedValue('react@latest'),
    queryDocs: vi.fn().mockResolvedValue('React docs content'),
  }

  return { cacheStore, fetcher }
}

// ── syncLib ───────────────────────────────────────────────────────────────────

describe('DocsSyncer.syncLib', () => {
  let syncer: DocsSyncer
  let cacheStore: ReturnType<typeof makeMocks>['cacheStore']
  let fetcher: ReturnType<typeof makeMocks>['fetcher']

  beforeEach(() => {
    const mocks = makeMocks()
    cacheStore = mocks.cacheStore
    fetcher = mocks.fetcher
    syncer = new DocsSyncer(cacheStore, fetcher)
  })

  it('calls resolveLibraryId with the library name', async () => {
    await syncer.syncLib('react')
    expect(fetcher.resolveLibraryId).toHaveBeenCalledWith('react')
  })

  it('calls queryDocs with the resolved libId', async () => {
    vi.mocked(fetcher.resolveLibraryId).mockResolvedValue('react-lib-id-123')
    await syncer.syncLib('react')
    expect(fetcher.queryDocs).toHaveBeenCalledWith('react-lib-id-123')
  })

  it('calls upsertDoc with libId, libName, and fetched content', async () => {
    vi.mocked(fetcher.resolveLibraryId).mockResolvedValue('my-lib-id')
    vi.mocked(fetcher.queryDocs).mockResolvedValue('fetched content')
    await syncer.syncLib('my-lib')
    expect(vi.mocked(cacheStore.upsertDoc)).toHaveBeenCalledWith({
      libId: 'my-lib-id',
      libName: 'my-lib',
      content: 'fetched content',
    })
  })

  it('returns the result from cacheStore.upsertDoc', async () => {
    const expected = makeDoc({ libName: 'react', content: 'React docs content' })
    vi.mocked(cacheStore.upsertDoc).mockReturnValue(expected)
    const result = await syncer.syncLib('react')
    expect(result).toBe(expected)
  })

  it('resolveLibraryId is called once per syncLib call', async () => {
    await syncer.syncLib('react')
    expect(fetcher.resolveLibraryId).toHaveBeenCalledTimes(1)
  })

  it('queryDocs is called once per syncLib call', async () => {
    await syncer.syncLib('react')
    expect(fetcher.queryDocs).toHaveBeenCalledTimes(1)
  })
})

// ── syncAll ───────────────────────────────────────────────────────────────────

describe('DocsSyncer.syncAll', () => {
  let syncer: DocsSyncer
  let cacheStore: ReturnType<typeof makeMocks>['cacheStore']
  let fetcher: ReturnType<typeof makeMocks>['fetcher']

  beforeEach(() => {
    const mocks = makeMocks()
    cacheStore = mocks.cacheStore
    fetcher = mocks.fetcher
    syncer = new DocsSyncer(cacheStore, fetcher)
  })

  it('calls getStaleLibs once', async () => {
    await syncer.syncAll()
    expect(vi.mocked(cacheStore.getStaleLibs)).toHaveBeenCalledTimes(1)
  })

  it('passes ONE_DAY_MS (86400000) to getStaleLibs', async () => {
    await syncer.syncAll()
    const ONE_DAY_MS = 24 * 60 * 60 * 1000
    expect(vi.mocked(cacheStore.getStaleLibs)).toHaveBeenCalledWith(ONE_DAY_MS)
  })

  it('returns empty array when no stale libs', async () => {
    vi.mocked(cacheStore.getStaleLibs).mockReturnValue([])
    const results = await syncer.syncAll()
    expect(results).toHaveLength(0)
  })

  it('syncs each stale lib and returns results', async () => {
    vi.mocked(cacheStore.getStaleLibs).mockReturnValue([
      makeDoc({ libName: 'react' }),
      makeDoc({ libId: 'vue@latest', libName: 'vue', id: 2 }),
    ])
    const reactDoc = makeDoc({ libName: 'react', content: 'React' })
    const vueDoc = makeDoc({ libId: 'vue@latest', libName: 'vue', id: 2, content: 'Vue' })
    vi.mocked(cacheStore.upsertDoc).mockReturnValueOnce(reactDoc).mockReturnValueOnce(vueDoc)
    const results = await syncer.syncAll()
    expect(results).toHaveLength(2)
  })

  it('does not throw when one lib sync fails', async () => {
    vi.mocked(cacheStore.getStaleLibs).mockReturnValue([
      makeDoc({ libName: 'failing-lib' }),
      makeDoc({ libName: 'good-lib', id: 2 }),
    ])
    vi.mocked(fetcher.resolveLibraryId)
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce('good@latest')
    const goodDoc = makeDoc({ libName: 'good-lib' })
    vi.mocked(cacheStore.upsertDoc).mockReturnValue(goodDoc)
    const results = await syncer.syncAll()
    expect(results).toHaveLength(1)
    expect(results[0]).toBe(goodDoc)
  })

  it('returns empty array when all lib syncs fail', async () => {
    vi.mocked(cacheStore.getStaleLibs).mockReturnValue([makeDoc({ libName: 'bad' })])
    vi.mocked(fetcher.resolveLibraryId).mockRejectedValue(new Error('all fail'))
    const results = await syncer.syncAll()
    expect(results).toHaveLength(0)
  })
})
