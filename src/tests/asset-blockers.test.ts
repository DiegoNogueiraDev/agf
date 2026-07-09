/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { analyzeAssetBlockers } from '../core/analyzer/asset-blockers.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(nodes: GraphDocument['nodes'] = [], edges: GraphDocument['edges'] = []): GraphDocument {
  return {
    version: '1.0',
    project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
    nodes,
    edges,
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

describe('analyzeAssetBlockers', () => {
  it('no asset nodes → zero counts', () => {
    const r = analyzeAssetBlockers(makeDoc())
    expect(r.totalAssets).toBe(0)
    expect(r.pendingAssets).toBe(0)
    expect(r.blockedTaskCount).toBe(0)
  })

  it('done assets not pending → no blockers', () => {
    const doc = makeDoc([
      { id: 'a1', type: 'asset', title: 'Texture Pack', status: 'done', priority: 3, createdAt: '', updatedAt: '' },
    ])
    const r = analyzeAssetBlockers(doc)
    expect(r.pendingAssets).toBe(0)
  })

  it('pending asset with requiring task → blocker detected', () => {
    const doc = makeDoc(
      [
        {
          id: 'a1',
          type: 'asset',
          title: 'Texture Pack',
          status: 'backlog',
          priority: 3,
          createdAt: '',
          updatedAt: '',
        },
        { id: 't1', type: 'task', title: 'Render', status: 'backlog', priority: 3, createdAt: '', updatedAt: '' },
      ],
      [{ id: 'e1', from: 't1', to: 'a1', relationType: 'requires_asset', createdAt: '' }],
    )
    const r = analyzeAssetBlockers(doc)
    expect(r.pendingAssets).toBe(1)
    expect(r.blockedTaskCount).toBe(1)
    expect(r.blockingAssets[0].blockedTaskIds).toEqual(['t1'])
  })
})
