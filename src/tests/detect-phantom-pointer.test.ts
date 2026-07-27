/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * Tests for detect-phantom-pointer — the dead-pointer detector for plan-time
 * backlog/ready tasks. A task whose description says "EXPAND src/X.ts" but the
 * file does not exist on disk is a phantom pointer.
 */

import { describe, it, expect } from 'vitest'
import { detectPhantomPointer } from '../core/gaps/detect-phantom-pointer.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(nodes: GraphDocument['nodes'] = []): GraphDocument {
  return {
    version: '1.0',
    project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
    nodes,
    edges: [],
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

function task(id: string, status: string, description?: string): GraphDocument['nodes'][number] {
  return {
    id,
    type: 'task',
    title: `task ${id}`,
    status: status as GraphDocument['nodes'][number]['status'],
    priority: 3,
    createdAt: '',
    updatedAt: '',
    ...(description ? { description } : {}),
  }
}

const existsAll = (): boolean => true
const existsNone = (): boolean => false

describe('detectPhantomPointer', () => {
  it('backlog task with EXPAND pointing to non-existent file → phantom_pointer gap', () => {
    const doc = makeDoc([task('t1', 'backlog', 'EXPAND src/core/nao-existe.ts')])
    const gaps = detectPhantomPointer(doc, existsNone)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].kind).toBe('phantom_pointer')
    expect(gaps[0].severity).toBe('recommended')
    expect(gaps[0].nodeId).toBe('t1')
    expect(gaps[0].evidence).toContain('src/core/nao-existe.ts')
  })

  it('ready task with EXPAND pointing to non-existent file → phantom_pointer gap', () => {
    const doc = makeDoc([task('t1', 'ready', 'EXPAND src/core/ghost.ts')])
    const gaps = detectPhantomPointer(doc, existsNone)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].nodeId).toBe('t1')
  })

  it('backlog task whose EXPAND path exists on disk → no gap (no false positive)', () => {
    const doc = makeDoc([task('t1', 'backlog', 'EXPAND src/core/real.ts')])
    expect(detectPhantomPointer(doc, existsAll)).toEqual([])
  })

  it('done task with EXPAND → ignored (phantom_done covers done, not this detector)', () => {
    const doc = makeDoc([task('t1', 'done', 'EXPAND src/core/ghost.ts')])
    expect(detectPhantomPointer(doc, existsNone)).toEqual([])
  })

  it('description without any EXPAND → returns 0 gaps', () => {
    const doc = makeDoc([task('t1', 'backlog', 'Just a regular description without markers')])
    expect(detectPhantomPointer(doc, existsNone)).toEqual([])
  })

  it('description with no src/ path after EXPAND → no match', () => {
    const doc = makeDoc([task('t1', 'backlog', 'EXPAND config.yaml')])
    expect(detectPhantomPointer(doc, existsNone)).toEqual([])
  })

  it('reports multiple missing EXPAND paths in same description', () => {
    const doc = makeDoc([task('t1', 'backlog', 'EXPAND src/a.ts and EXPAND src/b.ts')])
    const gaps = detectPhantomPointer(doc, (p) => p === 'src/a.ts')
    expect(gaps).toHaveLength(1)
    expect(gaps[0].evidence).toContain('src/b.ts')
    expect(gaps[0].evidence).not.toContain('src/a.ts')
  })

  it('empty doc → empty array', () => {
    expect(detectPhantomPointer(makeDoc(), existsNone)).toEqual([])
  })

  it('node without description → ignored', () => {
    const doc = makeDoc([task('t1', 'backlog')])
    expect(detectPhantomPointer(doc, existsNone)).toEqual([])
  })
})
