import { describe, it, expect } from 'vitest'
import { getTouchedFiles, haveFileOverlap } from '../core/planner/touched-files.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function makeNode(metadata?: Record<string, unknown>): GraphNode {
  return {
    id: 'n-001',
    title: 'Test node',
    type: 'task',
    status: 'pending',
    priority: 2,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    metadata,
  } as GraphNode
}

describe('getTouchedFiles', () => {
  it('returns empty array when metadata is absent', () => {
    const node = makeNode(undefined)
    expect(getTouchedFiles(node)).toEqual([])
  })

  it('returns empty array when touchedFiles is missing from metadata', () => {
    const node = makeNode({ someOtherField: true })
    expect(getTouchedFiles(node)).toEqual([])
  })

  it('returns empty array when touchedFiles is not an array', () => {
    const node = makeNode({ touchedFiles: 'not-an-array' })
    expect(getTouchedFiles(node)).toEqual([])
  })

  it('filters out non-string entries', () => {
    const node = makeNode({ touchedFiles: ['src/a.ts', 42, null, 'src/b.ts'] })
    expect(getTouchedFiles(node)).toEqual(['src/a.ts', 'src/b.ts'])
  })

  it('returns the file list when valid', () => {
    const files = ['src/core/graph/graph-store.ts', 'src/tests/graph-store.test.ts']
    const node = makeNode({ touchedFiles: files })
    expect(getTouchedFiles(node)).toEqual(files)
  })

  it('caps result at 20 files', () => {
    const files = Array.from({ length: 25 }, (_, i) => `src/file-${i}.ts`)
    const node = makeNode({ touchedFiles: files })
    expect(getTouchedFiles(node)).toHaveLength(20)
  })
})

describe('haveFileOverlap', () => {
  it('returns overlapping files', () => {
    const a = ['src/a.ts', 'src/b.ts', 'src/c.ts']
    const b = ['src/b.ts', 'src/d.ts']
    expect(haveFileOverlap(a, b)).toEqual(['src/b.ts'])
  })

  it('returns empty array when no overlap', () => {
    expect(haveFileOverlap(['src/a.ts'], ['src/b.ts'])).toEqual([])
  })

  it('handles empty arrays', () => {
    expect(haveFileOverlap([], ['src/a.ts'])).toEqual([])
    expect(haveFileOverlap(['src/a.ts'], [])).toEqual([])
  })
})
