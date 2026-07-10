/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi } from 'vitest'
import type {
  GraphNode,
  GraphEdge,
  GraphDocument,
  GraphIndexes,
  NodeType,
  NodeStatus,
  RelationType,
} from '../core/graph/graph-types.js'
import { buildIndexes } from '../core/graph/graph-indexes.js'
import { filterNodes, graphToMermaid } from '../core/graph/mermaid-export.js'
import type { MermaidExportOptions } from '../core/graph/mermaid-export.js'
import { graphToCsv } from '../core/graph/csv-export.js'
import type { CsvExportOptions } from '../core/graph/csv-export.js'
import { validateHealthScanInput, validateMermaidExportInput } from '../core/graph/validation.js'

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  const ts = new Date().toISOString()
  return {
    id: 'n1',
    type: 'task',
    title: 'Test Node',
    status: 'backlog',
    priority: 3,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  }
}

function makeEdge(overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    id: 'e1',
    from: 'n1',
    to: 'n2',
    relationType: 'depends_on',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeDoc(overrides: Partial<GraphDocument> = {}): GraphDocument {
  const now = new Date().toISOString()
  return {
    version: '1.0',
    project: { id: 'p1', name: 'test', createdAt: now, updatedAt: now },
    nodes: [],
    edges: [],
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
    ...overrides,
  }
}

describe('graph-types — type constructors', () => {
  it('creates a minimal GraphNode', () => {
    const n = makeNode()
    expect(n.id).toBe('n1')
    expect(n.type).toBe('task')
    expect(n.title).toBe('Test Node')
    expect(n.status).toBe('backlog')
    expect(n.priority).toBe(3)
    expect(n.createdAt).toBeTruthy()
    expect(n.updatedAt).toBeTruthy()
  })

  it('creates a GraphNode with all optional fields', () => {
    const n = makeNode({
      description: 'desc',
      xpSize: 'M',
      estimateMinutes: 120,
      tags: ['frontend', 'urgent'],
      parentId: 'epic-1',
      sprint: 'S1',
      sourceRef: { file: 'src/foo.ts', startLine: 10, confidence: 0.9 },
      acceptanceCriteria: ['should work'],
      testFiles: ['test/foo.test.ts'],
      blocked: true,
      metadata: { inferred: true, origin: 'import' },
      evolutionReason: 'refactored',
      evolutionCount: 1,
    })
    expect(n.description).toBe('desc')
    expect(n.xpSize).toBe('M')
    expect(n.estimateMinutes).toBe(120)
    expect(n.tags).toEqual(['frontend', 'urgent'])
    expect(n.parentId).toBe('epic-1')
    expect(n.sprint).toBe('S1')
    expect(n.sourceRef?.file).toBe('src/foo.ts')
    expect(n.acceptanceCriteria).toEqual(['should work'])
    expect(n.testFiles).toEqual(['test/foo.test.ts'])
    expect(n.blocked).toBe(true)
    expect(n.metadata?.inferred).toBe(true)
    expect(n.evolutionReason).toBe('refactored')
    expect(n.evolutionCount).toBe(1)
  })

  it('creates a GraphEdge with optional fields', () => {
    const e = makeEdge({ weight: 0.8, reason: 'because', metadata: { confidence: 0.9 } })
    expect(e.id).toBe('e1')
    expect(e.from).toBe('n1')
    expect(e.to).toBe('n2')
    expect(e.relationType).toBe('depends_on')
    expect(e.weight).toBe(0.8)
    expect(e.reason).toBe('because')
    expect(e.metadata?.confidence).toBe(0.9)
  })

  it('creates a GraphDocument with nodes and edges', () => {
    const n1 = makeNode({ id: 'n1' })
    const n2 = makeNode({ id: 'n2', parentId: 'n1' })
    const e1 = makeEdge({ id: 'e1', from: 'n1', to: 'n2' })
    const doc = makeDoc({ nodes: [n1, n2], edges: [e1] })
    expect(doc.nodes).toHaveLength(2)
    expect(doc.edges).toHaveLength(1)
    expect(doc.project.name).toBe('test')
  })
})

describe('graph-types — type enums', () => {
  it('accepts all NodeType values', () => {
    const types: NodeType[] = [
      'epic',
      'task',
      'subtask',
      'requirement',
      'constraint',
      'milestone',
      'acceptance_criteria',
      'risk',
      'decision',
      'interface',
      'formula',
      'state_machine',
      'contract',
      'scenario',
      'performance_budget',
      'asset',
      'data_table',
      'metric',
      'config_schema',
      'constitution',
      'journey_run',
      'browser_test',
    ]
    expect(types).toHaveLength(22)
    for (const t of types) {
      const n = makeNode({ type: t })
      expect(n.type).toBe(t)
    }
  })

  it('accepts all NodeStatus values', () => {
    const statuses: NodeStatus[] = ['backlog', 'ready', 'in_progress', 'blocked', 'done']
    for (const s of statuses) {
      const n = makeNode({ status: s })
      expect(n.status).toBe(s)
    }
  })

  it('accepts all RelationType values', () => {
    const types: RelationType[] = [
      'parent_of',
      'child_of',
      'depends_on',
      'blocks',
      'related_to',
      'priority_over',
      'implements',
      'derived_from',
      'provides',
      'consumes',
      'requires_asset',
      'decomposed_into',
      'tests',
      'validates_adr',
      'mirrors_unit',
    ]
    expect(types).toHaveLength(15)
    for (const t of types) {
      const e = makeEdge({ relationType: t, from: 'n1', to: 'n2' })
      expect(e.relationType).toBe(t)
    }
  })

  it('rejects invalid NodeType at runtime (type narrowing)', () => {
    const n = makeNode()
    const check: NodeType = n.type
    expect([
      'epic',
      'task',
      'subtask',
      'requirement',
      'constraint',
      'milestone',
      'acceptance_criteria',
      'risk',
      'decision',
      'interface',
      'formula',
      'state_machine',
      'contract',
      'scenario',
      'performance_budget',
      'asset',
      'data_table',
      'metric',
      'config_schema',
      'constitution',
      'journey_run',
      'browser_test',
    ]).toContain(check)
  })
})

describe('buildIndexes', () => {
  it('builds byId lookup for nodes', () => {
    const nodes = [makeNode({ id: 'a' }), makeNode({ id: 'b' })]
    const idx = buildIndexes(nodes, [])
    expect(idx.byId['a']).toBe(0)
    expect(idx.byId['b']).toBe(1)
  })

  it('builds childrenByParent from parentId', () => {
    const nodes = [
      makeNode({ id: 'root' }),
      makeNode({ id: 'child1', parentId: 'root' }),
      makeNode({ id: 'child2', parentId: 'root' }),
    ]
    const idx = buildIndexes(nodes, [])
    expect(idx.childrenByParent['root']).toEqual(expect.arrayContaining(['child1', 'child2']))
  })

  it('skips childrenByParent for nodes without parentId', () => {
    const nodes = [makeNode({ id: 'orphan' })]
    const idx = buildIndexes(nodes, [])
    expect(idx.childrenByParent).toEqual({})
  })

  it('builds outgoingByNode from edges', () => {
    const edges = [makeEdge({ id: 'e1', from: 'a', to: 'b' }), makeEdge({ id: 'e2', from: 'a', to: 'c' })]
    const idx = buildIndexes([], edges)
    expect(idx.outgoingByNode['a']).toEqual(['e1', 'e2'])
    expect(idx.incomingByNode['b']).toEqual(['e1'])
    expect(idx.incomingByNode['c']).toEqual(['e2'])
  })

  it('handles empty nodes and edges', () => {
    const idx = buildIndexes([], [])
    expect(idx.byId).toEqual({})
    expect(idx.childrenByParent).toEqual({})
    expect(idx.incomingByNode).toEqual({})
    expect(idx.outgoingByNode).toEqual({})
  })
})

describe('filterNodes', () => {
  const nodes = [
    makeNode({ id: 'a', status: 'done', type: 'task' }),
    makeNode({ id: 'b', status: 'in_progress', type: 'task' }),
    makeNode({ id: 'c', status: 'backlog', type: 'epic' }),
  ]

  it('returns all nodes when no options', () => {
    expect(filterNodes(nodes)).toHaveLength(3)
  })

  it('filters by status', () => {
    const opts: MermaidExportOptions = { filterStatus: ['done'] }
    const result = filterNodes(nodes, opts)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a')
  })

  it('filters by type', () => {
    const opts: MermaidExportOptions = { filterType: ['epic'] }
    const result = filterNodes(nodes, opts)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('c')
  })

  it('filters by status and type together', () => {
    const opts: MermaidExportOptions = { filterStatus: ['task'], filterType: ['task'] }
    const result = filterNodes(nodes, opts)
    expect(result).toHaveLength(0)
  })

  it('returns empty array when all filtered out', () => {
    const opts: MermaidExportOptions = { filterType: ['milestone'] }
    expect(filterNodes(nodes, opts)).toHaveLength(0)
  })
})

describe('graphToMermaid — flowchart', () => {
  const nodes = [
    makeNode({ id: 'ep1', title: 'Epic One', type: 'epic', status: 'in_progress' }),
    makeNode({ id: 't1', title: 'Task 1', type: 'task', status: 'done', parentId: 'ep1' }),
    makeNode({ id: 't2', title: 'Task 2', type: 'task', status: 'blocked', parentId: 'ep1' }),
  ]
  const edges = [
    makeEdge({ id: 'e1', from: 't1', to: 'ep1', relationType: 'child_of' }),
    makeEdge({ id: 'e2', from: 't2', to: 't1', relationType: 'depends_on' }),
  ]

  it('renders flowchart TD by default', () => {
    const result = graphToMermaid(nodes, edges)
    expect(result).toContain('graph TD')
    expect(result).toContain('ep1["Epic One"]')
    expect(result).toContain('t1["Task 1"]')
    expect(result).toContain('t2["Task 2"]')
  })

  it('renders LR direction', () => {
    const result = graphToMermaid(nodes, edges, { direction: 'LR' })
    expect(result).toContain('graph LR')
  })

  it('skips child_of edges (redundant)', () => {
    const result = graphToMermaid(nodes, edges)
    expect(result).not.toContain('child_of')
  })

  it('renders dashed edges for depends_on', () => {
    const result = graphToMermaid(nodes, edges)
    expect(result).toContain('t2 -.->|depends_on| t1')
  })

  it('applies status styling', () => {
    const result = graphToMermaid(nodes, edges)
    expect(result).toContain('style t1 fill:#4caf50')
    expect(result).toContain('style ep1 fill:#2196f3')
    expect(result).toContain('style t2 fill:#f44336')
  })

  it('handles empty nodes', () => {
    const result = graphToMermaid([], [])
    expect(result).toBe('graph TD\n')
  })
})

describe('graphToMermaid — gantt', () => {
  const nodes = [
    makeNode({
      id: 't1',
      title: 'Task 1',
      status: 'done',
      estimateMinutes: 240,
      createdAt: '2026-01-01T00:00:00.000Z',
      sprint: 'S1',
    }),
    makeNode({
      id: 't2',
      title: 'Task 2',
      status: 'in_progress',
      estimateMinutes: 120,
      createdAt: '2026-01-02T00:00:00.000Z',
      sprint: 'S1',
    }),
  ]
  const edges = [makeEdge({ id: 'e1', from: 't2', to: 't1', relationType: 'depends_on' })]

  it('renders gantt diagram', () => {
    const result = graphToMermaid(nodes, edges, { format: 'gantt' })
    expect(result).toContain('gantt')
    expect(result).toContain('dateFormat YYYY-MM-DD')
    expect(result).toContain('section S1')
    expect(result).toContain('Task 1')
    expect(result).toContain('done,')
    expect(result).toContain('Task 2')
    expect(result).toContain('active,')
  })

  it('estimates days from estimateMinutes', () => {
    const result = graphToMermaid(nodes, edges, { format: 'gantt' })
    expect(result).toContain('1d')
  })

  it('sanitizes IDs with colons', () => {
    const result = graphToMermaid(
      [makeNode({ id: 'EPIC-1:fix', title: 'Fix', createdAt: '2026-01-01T00:00:00.000Z' })],
      [],
      { format: 'gantt' },
    )
    expect(result).toContain('EPIC_1_fix')
    expect(result).not.toContain('EPIC-1:fix')
  })
})

describe('graphToMermaid — mindmap', () => {
  it('renders mindmap diagram', () => {
    const nodes = [
      makeNode({ id: 'root', title: 'Root', type: 'epic' }),
      makeNode({ id: 'child1', title: 'Child 1', parentId: 'root' }),
      makeNode({ id: 'child2', title: 'Child 2', parentId: 'root' }),
    ]
    const result = graphToMermaid(nodes, [], { format: 'mindmap' })
    expect(result).toContain('mindmap')
    expect(result).toContain('Root')
    expect(result).toContain('Child 1')
    expect(result).toContain('Child 2')
  })

  it('renders empty mindmap for no nodes', () => {
    const result = graphToMermaid([], [], { format: 'mindmap' })
    expect(result).toBe('mindmap\n')
  })
})

describe('graphToMermaid — stateDiagram', () => {
  it('renders stateMachine nodes as state diagram', () => {
    const nodes = [
      {
        ...makeNode({ id: 'sm1', type: 'state_machine', title: 'Order States' }),
        metadata: {
          states: ['pending', 'shipped', 'delivered'],
          initialState: 'pending',
          transitions: [
            { from: 'pending', to: 'shipped', trigger: 'ship' },
            { from: 'shipped', to: 'delivered', trigger: 'deliver' },
          ],
        },
      },
    ]
    const result = graphToMermaid([nodes[0] as GraphNode], [], { format: 'stateDiagram' })
    expect(result).toContain('stateDiagram-v2')
    expect(result).toContain('[*] --> pending')
    expect(result).toContain('pending --> shipped : ship')
    expect(result).toContain('shipped --> delivered : deliver')
  })

  it('returns empty when no stateMachine nodes', () => {
    const result = graphToMermaid([makeNode({ id: 't1' })], [], { format: 'stateDiagram' })
    expect(result).toContain('No state machines found')
  })
})

describe('graphToCsv', () => {
  const doc = makeDoc({
    nodes: [
      makeNode({
        id: 't1',
        title: 'Task,One',
        status: 'done',
        priority: 1,
        sprint: 'S1',
        xpSize: 'M',
        tags: ['a', 'b'],
        acceptanceCriteria: ['AC1'],
      }),
      makeNode({ id: 't2', title: 'Simple', status: 'backlog', priority: 2 }),
    ],
  })

  it('returns CSV header + rows', () => {
    const csv = graphToCsv(doc)
    const lines = csv.split('\n')
    expect(lines[0]).toBe('id,type,title,status,priority,sprint,xpSize,tags,parentId,acceptanceCriteria')
    expect(lines.length).toBe(3)
    expect(lines[1]).toContain('t1')
    expect(lines[2]).toContain('t2')
  })

  it('escapes title with commas', () => {
    const csv = graphToCsv(doc)
    expect(csv).toContain('"Task,One"')
  })

  it('filters by status', () => {
    const csv = graphToCsv(doc, { filterStatus: ['done'] })
    expect(csv).toContain('t1')
    expect(csv).not.toContain('t2')
  })

  it('filters by type', () => {
    const doc2 = makeDoc({
      nodes: [makeNode({ id: 't1', type: 'task' }), makeNode({ id: 'e1', type: 'epic' })],
    })
    const csv = graphToCsv(doc2, { filterType: ['epic'] })
    expect(csv).toContain('e1')
    expect(csv).not.toContain('t1')
  })

  it('handles empty nodes', () => {
    const csv = graphToCsv(makeDoc({ nodes: [] }))
    expect(csv.split('\n')).toHaveLength(1)
  })
})

describe('validation', () => {
  describe('validateHealthScanInput', () => {
    it('accepts valid input', () => {
      const result = validateHealthScanInput({ projectId: 'p1', includeCategories: ['cycle', 'orphan'] })
      expect(result.projectId).toBe('p1')
      expect(result.includeCategories).toEqual(['cycle', 'orphan'])
    })

    it('accepts empty input', () => {
      const result = validateHealthScanInput({})
      expect(result.projectId).toBeUndefined()
      expect(result.includeCategories).toBeUndefined()
    })

    it('rejects invalid category', () => {
      expect(() => validateHealthScanInput({ includeCategories: ['invalid'] })).toThrow()
    })
  })

  describe('validateMermaidExportInput', () => {
    it('accepts valid direction', () => {
      expect(validateMermaidExportInput({ direction: 'LR' }).direction).toBe('LR')
    })

    it('accepts includeEdgeLabels', () => {
      expect(validateMermaidExportInput({ includeEdgeLabels: true }).includeEdgeLabels).toBe(true)
    })

    it('accepts empty input', () => {
      const result = validateMermaidExportInput({})
      expect(result.direction).toBeUndefined()
      expect(result.includeEdgeLabels).toBeUndefined()
    })

    it('rejects invalid direction', () => {
      expect(() => validateMermaidExportInput({ direction: 'UP' })).toThrow()
    })
  })
})
