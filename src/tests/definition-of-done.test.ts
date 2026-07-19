/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkDefinitionOfDone } from '../core/implementer/definition-of-done.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode, GraphEdge } from '../core/graph/graph-types.js'

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  const ts = new Date().toISOString()
  return {
    id: 'node_test',
    type: 'task',
    title: 'Test Node',
    status: 'backlog',
    priority: 3,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  }
}

function makeDoc(nodes: GraphNode[], edges: GraphEdge[] = []) {
  return {
    version: '1.0.0',
    project: { id: 'proj_test', name: 'Test', createdAt: new Date().toISOString() },
    nodes,
    edges,
    indexes: { byId: {} },
    meta: {},
  }
}

describe('checkDefinitionOfDone', () => {
  it('returns not found for missing node', () => {
    const doc = makeDoc([])
    const result = checkDefinitionOfDone(doc, 'missing')
    expect(result.ready).toBe(false)
    expect(result.grade).toBe('F')
  })

  it('fails for missing AC', () => {
    const node = makeNode({ status: 'in_progress' })
    const doc = makeDoc([node])
    const result = checkDefinitionOfDone(doc, node.id)
    const acCheck = result.checks.find((c) => c.name === 'has_acceptance_criteria')
    expect(acCheck?.passed).toBe(false)
    expect(result.ready).toBe(false)
  })

  it('fails for invalid status flow', () => {
    const node = makeNode({ status: 'backlog', acceptanceCriteria: ['AC1'] })
    const doc = makeDoc([node])
    const result = checkDefinitionOfDone(doc, node.id)
    const statusCheck = result.checks.find((c) => c.name === 'status_flow_valid')
    expect(statusCheck?.passed).toBe(false)
    expect(result.ready).toBe(false)
  })

  it('has required checks for valid node', () => {
    const node = makeNode({
      status: 'in_progress',
      acceptanceCriteria: ['Testable AC: verify the function returns true'],
      description: 'Has description',
      xpSize: 'S',
      testFiles: ['src/tests/foo.test.ts'],
    })
    const doc = makeDoc([node])
    const result = checkDefinitionOfDone(doc, node.id)
    expect(result.checks.find((c) => c.name === 'has_acceptance_criteria')?.passed).toBe(true)
    expect(result.checks.find((c) => c.name === 'status_flow_valid')?.passed).toBe(true)
    expect(result.checks.find((c) => c.name === 'no_unresolved_blockers')?.passed).toBe(true)
  })

  it('passes when parent has AC', () => {
    const parent = makeNode({ id: 'parent', type: 'epic', acceptanceCriteria: ['Parent AC'] })
    const child = makeNode({ id: 'child', parentId: 'parent', status: 'in_progress' })
    const doc = makeDoc([parent, child])
    const result = checkDefinitionOfDone(doc, child.id)
    const acCheck = result.checks.find((c) => c.name === 'has_acceptance_criteria')
    expect(acCheck?.passed).toBe(true)
  })
})

describe('has_test_files auto-discovery fallback (node_wire_85d69b0a1a88)', () => {
  it('fails when no testFiles declared and dir option is absent (unchanged default behavior)', () => {
    const node = makeNode({ title: 'Widget renderer', testFiles: undefined })
    const doc = makeDoc([node])
    const result = checkDefinitionOfDone(doc, node.id)
    const check = result.checks.find((c) => c.name === 'has_test_files')
    expect(check?.passed).toBe(false)
  })

  it('passes via keyword auto-discovery when a matching test file exists under dir/src/tests', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-test-discovery-'))
    try {
      mkdirSync(join(dir, 'src/tests'), { recursive: true })
      writeFileSync(join(dir, 'src/tests/widget-renderer.test.ts'), 'export {}\n')

      const node = makeNode({ title: 'Widget renderer', testFiles: undefined })
      const doc = makeDoc([node])
      const result = checkDefinitionOfDone(doc, node.id, { dir })

      const check = result.checks.find((c) => c.name === 'has_test_files')
      expect(check?.passed).toBe(true)
      expect(check?.details).toContain('widget-renderer.test.ts')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('still fails when dir is given but no matching test file exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-test-discovery-empty-'))
    try {
      mkdirSync(join(dir, 'src/tests'), { recursive: true })

      const node = makeNode({ title: 'Totally unrelated feature', testFiles: undefined })
      const doc = makeDoc([node])
      const result = checkDefinitionOfDone(doc, node.id, { dir })

      const check = result.checks.find((c) => c.name === 'has_test_files')
      expect(check?.passed).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('stale_source_ref_pass (node_wire_deb553348c67)', () => {
  it('passes (N/A) when sourceRef is absent', () => {
    const node = makeNode()
    const doc = makeDoc([node])
    const result = checkDefinitionOfDone(doc, node.id)
    const check = result.checks.find((c) => c.name === 'stale_source_ref_pass')
    expect(check?.passed).toBe(true)
    expect(check?.details).toContain('N/A')
  })

  it('passes (N/A) when sourceRef has no line range', () => {
    const node = makeNode({ sourceRef: { file: 'src/core/whatever.ts' } })
    const doc = makeDoc([node])
    const result = checkDefinitionOfDone(doc, node.id)
    const check = result.checks.find((c) => c.name === 'stale_source_ref_pass')
    expect(check?.passed).toBe(true)
  })

  it('fails when the real file aged past the threshold with real LOC drift beyond it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-stale-source-ref-'))
    try {
      mkdirSync(join(dir, 'src/core'), { recursive: true })
      // Real file: 20 lines now, vs a recorded baseline range of 10 lines
      // (startLine=1, endLine=10) — 100% LOC drift, well past STALE_LOC_DELTA (0.3).
      writeFileSync(join(dir, 'src/core/grown.ts'), Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n'))

      const oldCreatedAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString() // 20 days ago
      const node = makeNode({
        createdAt: oldCreatedAt,
        sourceRef: { file: 'src/core/grown.ts', startLine: 1, endLine: 10 },
      })
      const doc = makeDoc([node])
      const result = checkDefinitionOfDone(doc, node.id, { dir })

      const check = result.checks.find((c) => c.name === 'stale_source_ref_pass')
      expect(check?.passed).toBe(false)
      expect(check?.details).toContain('desatualizado')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('passes when the real file has NOT drifted (same line count as baseline)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-stale-source-ref-stable-'))
    try {
      mkdirSync(join(dir, 'src/core'), { recursive: true })
      writeFileSync(join(dir, 'src/core/stable.ts'), Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n'))

      const oldCreatedAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString()
      const node = makeNode({
        createdAt: oldCreatedAt,
        sourceRef: { file: 'src/core/stable.ts', startLine: 1, endLine: 10 },
      })
      const doc = makeDoc([node])
      const result = checkDefinitionOfDone(doc, node.id, { dir })

      const check = result.checks.find((c) => c.name === 'stale_source_ref_pass')
      expect(check?.passed).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('passes (N/A-ish) when the sourceRef file no longer exists on disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-stale-source-ref-missing-'))
    try {
      const node = makeNode({ sourceRef: { file: 'src/core/gone.ts', startLine: 1, endLine: 10 } })
      const doc = makeDoc([node])
      const result = checkDefinitionOfDone(doc, node.id, { dir })

      const check = result.checks.find((c) => c.name === 'stale_source_ref_pass')
      expect(check?.details).toContain('não existe mais')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('tdd_gate_pass (node_wire_644a47f96fe9)', () => {
  function makeStoreWithPreset(presetName: string | undefined): SqliteStore {
    const store = SqliteStore.open(':memory:')
    store.initProject('tdd-gate-test')
    if (presetName) store.setProjectSetting('active_preset', presetName)
    return store
  }

  it('AC1: blocks when strict-tdd is active and no red test was observed', () => {
    const store = makeStoreWithPreset('strict-tdd')
    const node = makeNode({ status: 'in_progress', acceptanceCriteria: ['AC1'] })
    const doc = makeDoc([node])
    const result = checkDefinitionOfDone(doc, node.id, { db: store.getDb() })
    const check = result.checks.find((c) => c.name === 'tdd_gate_pass')
    expect(check?.passed).toBe(false)
    expect(check?.severity).toBe('required')
    expect(result.ready).toBe(false)
  })

  it('passes when strict-tdd is active and hasRedTestFirst is confirmed', () => {
    const store = makeStoreWithPreset('strict-tdd')
    const node = makeNode({ status: 'in_progress', acceptanceCriteria: ['AC1'] })
    const doc = makeDoc([node])
    const result = checkDefinitionOfDone(doc, node.id, { db: store.getDb(), hasRedTestFirst: true })
    const check = result.checks.find((c) => c.name === 'tdd_gate_pass')
    expect(check?.passed).toBe(true)
  })

  it('AC2: does not block when no preset is active (default, unchanged behavior)', () => {
    const store = makeStoreWithPreset(undefined)
    const node = makeNode({ status: 'in_progress', acceptanceCriteria: ['AC1'] })
    const doc = makeDoc([node])
    const result = checkDefinitionOfDone(doc, node.id, { db: store.getDb() })
    const check = result.checks.find((c) => c.name === 'tdd_gate_pass')
    expect(check?.passed).toBe(true)
  })

  it('does not block when no db is supplied (unchanged behavior for callers without a db handle)', () => {
    const node = makeNode({ status: 'in_progress', acceptanceCriteria: ['AC1'] })
    const doc = makeDoc([node])
    const result = checkDefinitionOfDone(doc, node.id)
    const check = result.checks.find((c) => c.name === 'tdd_gate_pass')
    expect(check?.passed).toBe(true)
  })
})
