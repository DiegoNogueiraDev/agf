/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  classifyBlocker,
  enumerateExternalBlocks,
  isHonestDoneTransition,
  type BlockNodeLike,
} from '../core/planner/external-blocker.js'
import { findNextTask } from '../core/planner/next-task.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(nodes: object[]): GraphDocument {
  return {
    version: '1',
    project: { id: 'p1', name: 'test', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    nodes,
    edges: [],
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  } as unknown as GraphDocument
}

function node(over: Partial<BlockNodeLike>): BlockNodeLike {
  return { id: 'n1', title: 't', status: 'blocked', blocked: true, ...over }
}

describe('classifyBlocker', () => {
  it('returns null when the node is not blocked', () => {
    expect(classifyBlocker(node({ blocked: false, status: 'backlog' }))).toBeNull()
  })

  it('classifies an unresolved code dependency as code', () => {
    expect(classifyBlocker(node({ title: 'refactor parser', description: 'waiting on helper task' }))).toBe('code')
  })

  it('classifies proxy / network access as external', () => {
    expect(classifyBlocker(node({ metadata: { blockReason: 'push blocked by corporate proxy (SSH timeout)' } }))).toBe(
      'external',
    )
  })

  it('classifies K8s / Vault / Azure DevOps as external', () => {
    expect(classifyBlocker(node({ metadata: { blockReason: 'needs K8s cluster access' } }))).toBe('external')
    expect(classifyBlocker(node({ description: 'Vault secret provisioning pending' }))).toBe('external')
    expect(classifyBlocker(node({ title: 'confirm Azure DevOps repo' }))).toBe('external')
  })

  it('honours an explicit metadata.blockerKind override', () => {
    expect(classifyBlocker(node({ metadata: { blockerKind: 'external' }, title: 'plain task' }))).toBe('external')
    expect(classifyBlocker(node({ metadata: { blockerKind: 'code' }, title: 'needs vault' }))).toBe('code')
  })
})

describe('enumerateExternalBlocks', () => {
  it('returns only externally-blocked nodes with a human action', () => {
    const nodes = [
      node({ id: 'a', metadata: { blockReason: 'K8s cluster access' } }),
      node({ id: 'b', title: 'waiting on sibling task', description: 'dep pending' }),
      node({ id: 'c', blocked: false, status: 'backlog' }),
      node({ id: 'd', metadata: { blockReason: 'Nexus corporate proxy' } }),
    ]
    const result = enumerateExternalBlocks(nodes)
    expect(result.map((r) => r.nodeId).sort()).toEqual(['a', 'd'])
    expect(result[0]?.requiredAction).toMatch(/human|infra/i)
    expect(result[0]?.reason.length).toBeGreaterThan(0)
  })

  it('returns empty when nothing is externally blocked', () => {
    expect(enumerateExternalBlocks([node({ title: 'code dep', description: 'blocked on task X' })])).toEqual([])
  })
})

describe('next/harvest excludes infra-blocked tasks from the code-actionable pull', () => {
  it('findNextTask never returns an externally-blocked task', () => {
    const doc = makeDoc([
      {
        id: 'infra',
        type: 'task',
        title: 'wire address migration',
        status: 'backlog',
        blocked: true,
        priority: 3,
        metadata: { blockReason: 'push blocked by corporate proxy' },
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ])
    // externally blocked (blocked=true) → not pulled; and it is classified external
    expect(findNextTask(doc)).toBeNull()
    expect(enumerateExternalBlocks(doc.nodes as unknown as BlockNodeLike[]).map((b) => b.nodeId)).toEqual(['infra'])
  })

  it('still pulls a sibling code-actionable task while infra one stays blocked', () => {
    const doc = makeDoc([
      {
        id: 'infra',
        type: 'task',
        title: 'provision Vault secret',
        status: 'backlog',
        blocked: true,
        priority: 5,
        metadata: { blockReason: 'Vault secret provisioning' },
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'code',
        type: 'task',
        title: 'add helper',
        status: 'backlog',
        blocked: false,
        priority: 3,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ])
    expect(findNextTask(doc)!.node.id).toBe('code')
  })
})

describe('isHonestDoneTransition (honesty invariant)', () => {
  it('rejects marking an externally-blocked node done', () => {
    expect(isHonestDoneTransition(node({ metadata: { blockReason: 'SSH push blocked' } }), 'done')).toBe(false)
  })

  it('allows non-done transitions for externally-blocked nodes', () => {
    expect(isHonestDoneTransition(node({ metadata: { blockReason: 'SSH push blocked' } }), 'in_progress')).toBe(true)
  })

  it('allows marking an unblocked node done', () => {
    expect(isHonestDoneTransition(node({ blocked: false, status: 'in_progress' }), 'done')).toBe(true)
  })
})
