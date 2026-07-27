/*!
 * TDD: gaps-cmd --select output contract (node_47b0a2621711).
 *
 * AC: Given --select data.ready, when run, then only the boolean is emitted.
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { detectAllGaps } from '../core/gaps/index.js'
import { buildGapReport } from '../core/gaps/gap-types.js'

function makeStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('Test')
  return store
}

describe('gaps output contract (--select data.ready)', () => {
  it('buildGapReport returns a ready boolean in its result', () => {
    const store = makeStore()
    const doc = store.toGraphDocument()
    const report = buildGapReport(detectAllGaps(doc))
    expect(typeof report.ready).toBe('boolean')
  })

  it('empty project returns ready:true (no gaps)', () => {
    const store = makeStore()
    const doc = store.toGraphDocument()
    const report = buildGapReport(detectAllGaps(doc))
    expect(report.ready).toBe(true)
  })

  it('report has gaps array (empty for clean project)', () => {
    const store = makeStore()
    const doc = store.toGraphDocument()
    const report = buildGapReport(detectAllGaps(doc))
    expect(Array.isArray(report.gaps)).toBe(true)
  })
})
