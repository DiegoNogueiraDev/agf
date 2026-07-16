/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_189058f47592 — Task feature extraction for RL routing
 *
 * AC1: GIVEN task WHEN analyzed THEN extracts type (implement/review/decompose), ac_count,
 *      blast_radius, has_external_deps
 * AC2: WHEN features extracted THEN stored in node metadata
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { extractTaskFeatures, storeTaskFeatures, type TaskFeatures } from '../core/router/task-feature-extractor.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function makeDb() {
  const db = new Database(':memory:')
  runMigrations(db)
  return db
}

function makeStore() {
  const db = makeDb()
  return new SqliteStore(db)
}

function baseNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: 'node_test',
    type: 'task',
    title: 'Implement user auth module',
    description: 'Add JWT-based authentication',
    priority: 1,
    status: 'backlog',
    acceptanceCriteria: ['user can login', 'token expires in 1h'],
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

// ── AC1 — feature extraction ──────────────────────────────────────────────────

describe('extractTaskFeatures (AC1 — task type)', () => {
  it('classifies implement tasks by title keywords', () => {
    const node = baseNode({ title: 'Implement auth module' })
    const f = extractTaskFeatures(node)
    expect(f.taskType).toBe('implement')
  })

  it('classifies review tasks', () => {
    const node = baseNode({ title: 'Review PR: add caching layer' })
    const f = extractTaskFeatures(node)
    expect(f.taskType).toBe('review')
  })

  it('classifies decompose tasks', () => {
    const node = baseNode({ title: 'Decompose epic: user management' })
    const f = extractTaskFeatures(node)
    expect(f.taskType).toBe('decompose')
  })

  it('defaults to implement when no keyword matches', () => {
    const node = baseNode({ title: 'Auth module' })
    const f = extractTaskFeatures(node)
    expect(f.taskType).toBe('implement')
  })
})

describe('extractTaskFeatures (AC1 — ac_count)', () => {
  it('counts acceptance criteria', () => {
    const node = baseNode({ acceptanceCriteria: ['login works', 'logout works', 'token refreshes'] })
    const f = extractTaskFeatures(node)
    expect(f.acCount).toBe(3)
  })

  it('returns 0 when no acceptance criteria', () => {
    const node = baseNode({ acceptanceCriteria: [] })
    const f = extractTaskFeatures(node)
    expect(f.acCount).toBe(0)
  })
})

describe('extractTaskFeatures (AC1 — blast_radius)', () => {
  it('blast_radius is 1 for S size', () => {
    const node = baseNode({ xpSize: 'S' })
    const f = extractTaskFeatures(node)
    expect(f.blastRadius).toBe(1)
  })

  it('blast_radius is 2 for M size', () => {
    const node = baseNode({ xpSize: 'M' })
    const f = extractTaskFeatures(node)
    expect(f.blastRadius).toBe(2)
  })

  it('blast_radius is 3 for L size', () => {
    const node = baseNode({ xpSize: 'L' })
    const f = extractTaskFeatures(node)
    expect(f.blastRadius).toBe(3)
  })

  it('blast_radius is 1 when size is undefined', () => {
    const node = baseNode()
    const f = extractTaskFeatures(node)
    expect(f.blastRadius).toBe(1)
  })
})

describe('extractTaskFeatures (AC1 — has_external_deps)', () => {
  it('true when tags include external or api or integration', () => {
    const node = baseNode({ tags: ['api', 'core'] })
    const f = extractTaskFeatures(node)
    expect(f.hasExternalDeps).toBe(true)
  })

  it('true when description mentions external/api/http', () => {
    const node = baseNode({ description: 'Call the payment API to charge user' })
    const f = extractTaskFeatures(node)
    expect(f.hasExternalDeps).toBe(true)
  })

  it('false when no external signals', () => {
    const node = baseNode({ tags: ['core'], description: 'Internal refactor only' })
    const f = extractTaskFeatures(node)
    expect(f.hasExternalDeps).toBe(false)
  })
})

// ── AC2 — stored in node metadata ────────────────────────────────────────────

describe('storeTaskFeatures (AC2 — persisted in metadata)', () => {
  it('stores features in node metadata and returns updated node', () => {
    const store = makeStore()
    store.initProject('test')
    const nodeData = { ...baseNode(), id: 'node_feat_test' }
    store.insertNode(nodeData)
    const node = store.getNodeById('node_feat_test')
    expect(node).not.toBeNull()

    const features: TaskFeatures = {
      taskType: 'implement',
      acCount: 2,
      blastRadius: 1,
      hasExternalDeps: false,
    }
    const updated = storeTaskFeatures(store, 'node_feat_test', features)
    expect(updated).not.toBeNull()
    expect(updated?.metadata?.taskFeatures).toMatchObject(features)
  })
})
