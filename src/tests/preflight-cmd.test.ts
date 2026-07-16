/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode } from '../core/graph/graph-types.js'
import { deriveTopic, runPreflight, type GitProbe } from '../core/preflight/preflight.js'
import { makeGraphProbe } from '../core/preflight/preflight-adapters.js'

function makeNode(over: Partial<GraphNode> = {}): GraphNode {
  const ts = new Date().toISOString()
  return {
    id: `node_${Math.random().toString(36).slice(2, 8)}`,
    type: 'task',
    title: 'X',
    status: 'backlog',
    priority: 3,
    createdAt: ts,
    updatedAt: ts,
    ...over,
  }
}

const stubGit: GitProbe = {
  branch: () => 'main',
  aheadBehind: () => ({ ahead: 0, behind: 0 }),
  dirtyCount: () => 0,
  stashCount: () => 0,
  commitsMatching: () => [],
}

describe('deriveTopic', () => {
  it('prefers the explicit topic over the node title', () => {
    expect(deriveTopic('explicit', 'node title')).toBe('explicit')
  })
  it('falls back to the node title when topic is empty/whitespace', () => {
    expect(deriveTopic('   ', 'HTN planner')).toBe('HTN planner')
    expect(deriveTopic(undefined, 'HTN planner')).toBe('HTN planner')
  })
  it('returns null when neither is provided', () => {
    expect(deriveTopic(null, null)).toBeNull()
    expect(deriveTopic('', '')).toBeNull()
  })
})

describe('preflight over a real store (makeGraphProbe + FTS)', () => {
  let store: SqliteStore
  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject()
  })
  afterEach(() => store?.close())

  it('flags wip-conflict when an in_progress node matches the topic', () => {
    store.insertNode(makeNode({ id: 'dup', title: 'HTN skill planner preconditions', status: 'in_progress' }))
    const report = runPreflight({ topic: 'HTN skill planner', git: stubGit, graph: makeGraphProbe(store) })
    expect(report.verdict).toBe('wip-conflict')
    expect(report.dedupeHits.some((h) => h.id === 'dup')).toBe(true)
  })

  it('excludes the node itself from its own duplicate hits', () => {
    store.insertNode(makeNode({ id: 'self', title: 'Preflight guard golden rule', status: 'in_progress' }))
    const report = runPreflight({
      topic: 'Preflight guard golden rule',
      nodeId: 'self',
      git: stubGit,
      graph: makeGraphProbe(store),
    })
    expect(report.dedupeHits.some((h) => h.id === 'self')).toBe(false)
  })

  it('reports current WIP nodes via listWip', () => {
    store.insertNode(makeNode({ id: 'w', title: 'Some active work', status: 'in_progress' }))
    const report = runPreflight({ topic: 'totally unrelated xyzzy topic', git: stubGit, graph: makeGraphProbe(store) })
    expect(report.wipNodes.some((n) => n.id === 'w')).toBe(true)
  })

  it('does NOT raise false-positive dedupe on an unrelated multi-word topic', () => {
    store.insertNode(makeNode({ id: 'a', title: 'Implement budget kleiber lever', status: 'done' }))
    store.insertNode(makeNode({ id: 'b', title: 'Render kanban board view', status: 'backlog' }))
    const report = runPreflight({
      topic: 'xyzzy quux frobnicate widget 9912',
      git: stubGit,
      graph: makeGraphProbe(store),
    })
    expect(report.dedupeHits).toHaveLength(0)
    expect(report.verdict).toBe('safe')
  })
})
