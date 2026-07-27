/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore, type MutationOptions } from '../core/store/sqlite-store.js'
import {
  GraphNotInitializedError,
  ValidationError,
  ConflictError,
  McpGraphError,
  SnapshotNotFoundError,
} from '../core/utils/errors.js'
import type { GraphNode, GraphEdge, NodeType, NodeStatus } from '../core/graph/graph-types.js'

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  const ts = new Date().toISOString()
  return {
    id: `node_${Math.random().toString(36).slice(2, 8)}`,
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
  const ts = new Date().toISOString()
  return {
    id: `edge_${Math.random().toString(36).slice(2, 8)}`,
    from: '',
    to: '',
    relationType: 'depends_on',
    createdAt: ts,
    ...overrides,
  }
}

describe('SqliteStore — open / init', () => {
  let store: SqliteStore

  afterEach(() => {
    store?.close()
  })

  it('opens an in-memory database', () => {
    store = SqliteStore.open(':memory:')
    expect(store).toBeInstanceOf(SqliteStore)
  })

  it('throws GraphNotInitializedError when no project exists and nodes are accessed', () => {
    store = SqliteStore.open(':memory:')
    expect(() => store.getAllNodes()).toThrow(GraphNotInitializedError)
  })

  it('initProject creates a project with default name', () => {
    store = SqliteStore.open(':memory:')
    const project = store.initProject()
    expect(project.id).toBeTruthy()
    expect(project.name).toBe('Local MCP Graph')
    expect(project.createdAt).toBeTruthy()
  })

  it('initProject uses provided name', () => {
    store = SqliteStore.open(':memory:')
    const project = store.initProject('My Project')
    expect(project.name).toBe('My Project')
  })

  it('initProject is idempotent when same name', () => {
    store = SqliteStore.open(':memory:')
    const p1 = store.initProject('Test')
    const p2 = store.initProject('Test')
    expect(p1.id).toBe(p2.id)
  })

  it('getProject returns null before init', () => {
    store = SqliteStore.open(':memory:')
    expect(store.getProject()).toBeNull()
  })

  it('getProject returns project after init', () => {
    store = SqliteStore.open(':memory:')
    store.initProject('Test')
    const project = store.getProject()
    expect(project).not.toBeNull()
    expect(project!.name).toBe('Test')
  })

  it('getActiveProject aliases getProject', () => {
    store = SqliteStore.open(':memory:')
    expect(store.getActiveProject()).toBeNull()
    store.initProject('Test')
    expect(store.getActiveProject()!.name).toBe('Test')
  })

  it('listProjects returns all projects', () => {
    store = SqliteStore.open(':memory:')
    store.initProject('Alpha')
    expect(store.listProjects()).toHaveLength(1)
    expect(store.listProjects()[0].name).toBe('Alpha')
  })

  it('activateProject switches active project', () => {
    store = SqliteStore.open(':memory:')
    store.initProject('First')
    const p1 = store.getProject()!
    store.initProject('Second')
    const p2 = store.getProject()!
    expect(p2.name).toBe('Second')
    store.activateProject(p1.id)
    expect(store.getProject()!.name).toBe('First')
  })

  it('activateProject throws for non-existent project', () => {
    store = SqliteStore.open(':memory:')
    store.initProject()
    expect(() => store.activateProject('nonexistent')).toThrow(ValidationError)
  })

  it('registerProject creates new project with fsPath', () => {
    store = SqliteStore.open(':memory:')
    const project = store.registerProject('My Project', '/some/path')
    expect(project.name).toBe('My Project')
    expect(project.fsPath).toBe('/some/path')
  })

  it('registerProject reuses existing project at same path', () => {
    store = SqliteStore.open(':memory:')
    const p1 = store.registerProject('A', '/path')
    const p2 = store.registerProject('B', '/path')
    expect(p1.id).toBe(p2.id)
    expect(p1.name).toBe('A')
  })

  it('findProjectByPath returns null for unknown path', () => {
    store = SqliteStore.open(':memory:')
    expect(store.findProjectByPath('/unknown')).toBeNull()
  })

  it('findProjectByPath returns project after registration', () => {
    store = SqliteStore.open(':memory:')
    store.registerProject('Test', '/test/path')
    const found = store.findProjectByPath('/test/path')
    expect(found).not.toBeNull()
    expect(found!.name).toBe('Test')
  })

  it('setProjectFsPath updates fs_path on project', () => {
    store = SqliteStore.open(':memory:')
    store.initProject('Test')
    const p = store.getProject()!
    store.setProjectFsPath(p.id, '/new/path')
    expect(store.findProjectByPath('/new/path')!.id).toBe(p.id)
  })

  it('close cleans up the database connection', () => {
    store = SqliteStore.open(':memory:')
    store.initProject()
    store.close()
    expect(() => store.getAllNodes()).toThrow()
  })
})

describe('SqliteStore — node CRUD', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject()
  })

  afterEach(() => {
    store?.close()
  })

  it('insertNode and getNodeById', () => {
    const node = makeNode({ title: 'My Task', type: 'task' })
    store.insertNode(node)
    const found = store.getNodeById(node.id)
    expect(found).not.toBeNull()
    expect(found!.id).toBe(node.id)
    expect(found!.title).toBe('My Task')
    expect(found!.type).toBe('task')
    expect(found!.status).toBe('backlog')
    expect(found!.priority).toBe(3)
  })

  it('getNodeById returns null for missing node', () => {
    expect(store.getNodeById('nonexistent')).toBeNull()
  })

  it('getAllNodes returns empty array when no nodes', () => {
    expect(store.getAllNodes()).toEqual([])
  })

  it('getAllNodes returns inserted nodes', () => {
    const n1 = makeNode({ title: 'A' })
    const n2 = makeNode({ title: 'B' })
    store.insertNode(n1)
    store.insertNode(n2)
    const nodes = store.getAllNodes()
    expect(nodes).toHaveLength(2)
  })

  it('insertNode validates with schema — rejects missing required fields', () => {
    const bad = { id: 'n1', type: 'task' } as unknown as GraphNode
    expect(() => store.insertNode(bad)).toThrow(ValidationError)
  })

  it('insertNode rejects self-referencing parentId', () => {
    const node = makeNode()
    node.parentId = node.id
    expect(() => store.insertNode(node)).toThrow(ValidationError)
  })

  it('updateNode updates fields', () => {
    const node = makeNode()
    store.insertNode(node)
    const updated = store.updateNode(node.id, { title: 'Updated', priority: 1 })
    expect(updated).not.toBeNull()
    expect(updated!.title).toBe('Updated')
    expect(updated!.priority).toBe(1)
  })

  it('updateNode returns null for missing node', () => {
    expect(store.updateNode('nonexistent', { title: 'New' })).toBeNull()
  })

  it('updateNode with empty fields returns existing node', () => {
    const node = makeNode()
    store.insertNode(node)
    const updated = store.updateNode(node.id, {})
    expect(updated).not.toBeNull()
    expect(updated!.title).toBe(node.title)
  })

  it('updateNode rejects parent cycle', () => {
    const parent = makeNode()
    const child = makeNode()
    store.insertNode(parent)
    store.insertNode(child)
    store.updateNode(child.id, { parentId: parent.id })
    expect(() => store.updateNode(parent.id, { parentId: child.id })).toThrow(ValidationError)
  })

  it('updateNodeStatus changes status', () => {
    const node = makeNode({ status: 'backlog' })
    store.insertNode(node)
    const updated = store.updateNodeStatus(node.id, 'in_progress')
    expect(updated!.status).toBe('in_progress')
  })

  it('updateNodeStatus returns null for missing node', () => {
    expect(store.updateNodeStatus('nonexistent', 'done')).toBeNull()
  })

  it('deleteNode archives node (soft-delete) — invisible via getNodeById', () => {
    const node = makeNode()
    store.insertNode(node)
    expect(store.deleteNode(node.id)).toBe(true)
    expect(store.getNodeById(node.id)).toBeNull()
  })

  it('deleteNode returns false for missing node', () => {
    expect(store.deleteNode('nonexistent')).toBe(false)
  })

  it('deleteNode archives node and descendants (cascade soft-delete)', () => {
    const parent = makeNode()
    const child = makeNode()
    store.insertNode(parent)
    store.insertNode(child)
    store.updateNode(child.id, { parentId: parent.id })

    const edge = makeEdge({ from: parent.id, to: child.id, relationType: 'parent_of' })
    store.insertEdge(edge)

    expect(store.deleteNode(parent.id)).toBe(true)
    expect(store.getNodeById(child.id)).toBeNull()
  })

  it('restoreNode makes an archived node visible again', () => {
    const node = makeNode()
    store.insertNode(node)
    store.deleteNode(node.id)
    expect(store.getNodeById(node.id)).toBeNull()
    expect(store.restoreNode(node.id)).toBe(true)
    expect(store.getNodeById(node.id)).not.toBeNull()
  })

  it('restoreNode returns false for non-archived node', () => {
    const node = makeNode()
    store.insertNode(node)
    expect(store.restoreNode(node.id)).toBe(false)
  })

  it('archived nodes are excluded from getAllNodes', () => {
    const keep = makeNode()
    const removed = makeNode()
    store.insertNode(keep)
    store.insertNode(removed)
    store.deleteNode(removed.id)
    const ids = store.getAllNodes().map((n) => n.id)
    expect(ids).toContain(keep.id)
    expect(ids).not.toContain(removed.id)
  })

  it('updateNode with expectedVersion — ConflictError on version mismatch', () => {
    const node = makeNode()
    store.insertNode(node)
    store.updateNode(node.id, { title: 'v2' })
    const opts: MutationOptions = { expectedVersion: 1 }
    expect(() => store.updateNode(node.id, { title: 'v3' }, opts)).toThrow(ConflictError)
  })

  it('updateNode with agentId tracks modified_by', () => {
    const node = makeNode()
    store.insertNode(node)
    const opts: MutationOptions = { agentId: 'agent-42' }
    const updated = store.updateNode(node.id, { title: 'Updated' }, opts)
    expect(updated!.title).toBe('Updated')
  })

  it('insertNode with agentId stores modified_by', () => {
    const node = makeNode()
    store.insertNode(node, { agentId: 'agent-99' })
    expect(store.getNodeById(node.id)).not.toBeNull()
  })
})

describe('SqliteStore — queryNodes', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject()
    const n1 = makeNode({ title: 'Alpha', type: 'task', status: 'backlog' })
    const n2 = makeNode({ title: 'Beta', type: 'epic', status: 'in_progress' })
    const n3 = makeNode({ title: 'Gamma', type: 'task', status: 'done' })
    store.insertNode(n1)
    store.insertNode(n2)
    store.insertNode(n3)
  })

  afterEach(() => {
    store?.close()
  })

  it('returns all nodes with pagination', () => {
    const result = store.queryNodes({ limit: 10, offset: 0 })
    expect(result.nodes).toHaveLength(3)
    expect(result.totalCount).toBe(3)
  })

  it('filters by status', () => {
    const result = store.queryNodes({ status: ['backlog'] })
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].title).toBe('Alpha')
  })

  it('filters by type', () => {
    const result = store.queryNodes({ type: ['epic'] })
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].title).toBe('Beta')
  })

  it('filters by search', () => {
    const result = store.queryNodes({ search: 'Bet' })
    expect(result.nodes).toHaveLength(1)
  })

  it('clamps limit between 1 and 500', () => {
    const r1 = store.queryNodes({ limit: 0 })
    expect(r1.nodes.length).toBeLessThanOrEqual(3)
    const r2 = store.queryNodes({ limit: 1000 })
    expect(r2.nodes.length).toBeLessThanOrEqual(3)
  })
})

describe('SqliteStore — getNodesByType / getNodesByStatus / getChildNodes', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject()
    const parent = makeNode({ title: 'Parent', type: 'epic' })
    store.insertNode(parent)
    const child = makeNode({ title: 'Child', type: 'task' })
    store.insertNode(child)
    store.updateNode(child.id, { parentId: parent.id })
  })

  afterEach(() => {
    store?.close()
  })

  it('getNodesByType filters correctly', () => {
    const epics = store.getNodesByType('epic')
    expect(epics).toHaveLength(1)
    expect(epics[0].title).toBe('Parent')
  })

  it('getNodesByStatus filters correctly', () => {
    const items = store.getNodesByStatus('backlog')
    expect(items).toHaveLength(2)
  })

  it('getChildNodes returns children', () => {
    const parent = store.getNodesByType('epic')[0]
    const children = store.getChildNodes(parent.id)
    expect(children).toHaveLength(1)
    expect(children[0].title).toBe('Child')
  })
})

describe('SqliteStore — node history / changelog', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject()
  })

  afterEach(() => {
    store?.close()
  })

  it('records status change in history', () => {
    const node = makeNode({ status: 'backlog' })
    store.insertNode(node)
    store.updateNodeStatus(node.id, 'in_progress')
    const history = store.getNodeHistory(node.id)
    expect(history.length).toBeGreaterThanOrEqual(1)
    expect(history[0].field).toBe('status')
    expect(history[0].oldValue).toBe('backlog')
    expect(history[0].newValue).toBe('in_progress')
  })

  it('records field changes in history', () => {
    const node = makeNode()
    store.insertNode(node)
    store.updateNode(node.id, { title: 'Renamed', priority: 5 })
    const history = store.getNodeHistory(node.id)
    const titleChanges = history.filter((h) => h.field === 'title')
    expect(titleChanges.length).toBeGreaterThanOrEqual(1)
  })
})

describe('SqliteStore — edge CRUD', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject()
  })

  afterEach(() => {
    store?.close()
  })

  it('insertEdge and getAllEdges', () => {
    const n1 = makeNode()
    const n2 = makeNode()
    store.insertNode(n1)
    store.insertNode(n2)

    const edge = makeEdge({ from: n1.id, to: n2.id, relationType: 'depends_on' })
    store.insertEdge(edge)

    const edges = store.getAllEdges()
    expect(edges).toHaveLength(1)
    expect(edges[0].from).toBe(n1.id)
    expect(edges[0].to).toBe(n2.id)
  })

  it('insertEdge requires existing nodes', () => {
    const edge = makeEdge({ from: 'missing1', to: 'missing2', relationType: 'depends_on' })
    store.insertEdge(edge)
    expect(store.getAllEdges()).toHaveLength(0)
  })

  it('getEdgesFrom returns outgoing edges', () => {
    const n1 = makeNode()
    const n2 = makeNode()
    store.insertNode(n1)
    store.insertNode(n2)
    const edge = makeEdge({ from: n1.id, to: n2.id })
    store.insertEdge(edge)
    const from = store.getEdgesFrom(n1.id)
    expect(from).toHaveLength(1)
  })

  it('getEdgesTo returns incoming edges', () => {
    const n1 = makeNode()
    const n2 = makeNode()
    store.insertNode(n1)
    store.insertNode(n2)
    const edge = makeEdge({ from: n1.id, to: n2.id })
    store.insertEdge(edge)
    const to = store.getEdgesTo(n2.id)
    expect(to).toHaveLength(1)
  })

  it('deleteEdge removes edge', () => {
    const n1 = makeNode()
    const n2 = makeNode()
    store.insertNode(n1)
    store.insertNode(n2)
    const edge = makeEdge({ from: n1.id, to: n2.id })
    store.insertEdge(edge)
    expect(store.deleteEdge(edge.id)).toBe(true)
    expect(store.getAllEdges()).toHaveLength(0)
  })

  it('deleteEdge returns false for missing edge', () => {
    expect(store.deleteEdge('nonexistent')).toBe(false)
  })

  it('insertEdge validates with schema — rejects missing fields', () => {
    const bad = { id: 'e1', from: 'a', to: 'b' } as unknown as GraphEdge
    expect(() => store.insertEdge(bad)).toThrow(ValidationError)
  })
})

describe('SqliteStore — searchNodes (FTS5)', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject()
    const tasks = ['Fix login bug', 'Add search feature', 'Update documentation', 'Refactor database layer']
    for (const title of tasks) {
      store.insertNode(makeNode({ title, type: 'task', status: 'backlog' }))
    }
  })

  afterEach(() => {
    store?.close()
  })

  it('searches by title', () => {
    const results = store.searchNodes('login')
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].title).toContain('login')
  })

  it('returns empty array for no match', () => {
    const results = store.searchNodes('zzzzzzzzzz')
    expect(results).toHaveLength(0)
  })

  it('includes score in results', () => {
    const results = store.searchNodes('search')
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(typeof results[0].score).toBe('number')
  })

  it('respects limit parameter', () => {
    const results = store.searchNodes('bug search feature', 1)
    expect(results.length).toBeLessThanOrEqual(1)
  })
})

describe('SqliteStore — bulk operations', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject()
  })

  afterEach(() => {
    store?.close()
  })

  it('bulkInsert inserts nodes and edges', () => {
    const n1 = makeNode()
    const n2 = makeNode()
    const edge = makeEdge({ from: n1.id, to: n2.id, relationType: 'depends_on' })
    store.bulkInsert([n1, n2], [edge])
    expect(store.getAllNodes()).toHaveLength(2)
    expect(store.getAllEdges()).toHaveLength(1)
  })

  it('mergeInsert inserts only new rows', () => {
    const n1 = makeNode()
    store.bulkInsert([n1], [])
    const n1Dup = { ...n1 }
    const n2 = makeNode()
    const result = store.mergeInsert([n1Dup, n2], [])
    expect(result.nodesInserted).toBe(1)
    expect(store.getAllNodes()).toHaveLength(2)
  })

  it('bulkUpdateStatus updates multiple nodes', () => {
    const n1 = makeNode({ status: 'backlog' })
    const n2 = makeNode({ status: 'backlog' })
    store.insertNode(n1)
    store.insertNode(n2)
    const result = store.bulkUpdateStatus([n1.id, n2.id], 'in_progress')
    expect(result.updated).toHaveLength(2)
    expect(result.notFound).toHaveLength(0)
    expect(store.getNodeById(n1.id)!.status).toBe('in_progress')
  })

  it('bulkUpdateStatus returns notFound for missing ids', () => {
    const result = store.bulkUpdateStatus(['nonexistent'], 'done')
    expect(result.updated).toHaveLength(0)
    expect(result.notFound).toHaveLength(1)
  })
})

describe('SqliteStore — snapshots', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject()
  })

  afterEach(() => {
    store?.close()
  })

  it('createSnapshot and listSnapshots', () => {
    const n1 = makeNode()
    store.insertNode(n1)
    const id = store.createSnapshot()
    expect(typeof id).toBe('number')
    const snapshots = store.listSnapshots()
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0].snapshotId).toBe(id)
  })

  it('restoreSnapshot restores nodes and edges', () => {
    const n1 = makeNode({ title: 'Original' })
    store.insertNode(n1)
    const snapshotId = store.createSnapshot()

    store.deleteNode(n1.id)
    expect(store.getNodeById(n1.id)).toBeNull()

    const result = store.restoreSnapshot(snapshotId)
    expect(result.nodesValid).toBeGreaterThanOrEqual(1)
    expect(store.getNodeById(n1.id)!.title).toBe('Original')
  })

  it('restoreSnapshot throws for missing snapshot', () => {
    expect(() => store.restoreSnapshot(999)).toThrow(SnapshotNotFoundError)
  })
})

describe('SqliteStore — stats', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject()
  })

  afterEach(() => {
    store?.close()
  })

  it('getStats returns zeroes when empty', () => {
    const stats = store.getStats()
    expect(stats.totalNodes).toBe(0)
    expect(stats.totalEdges).toBe(0)
  })

  it('getStats counts nodes by type and status', () => {
    store.insertNode(makeNode({ type: 'task', status: 'backlog' }))
    store.insertNode(makeNode({ type: 'epic', status: 'in_progress' }))
    const stats = store.getStats()
    expect(stats.totalNodes).toBe(2)
    expect(stats.byType.task).toBe(1)
    expect(stats.byType.epic).toBe(1)
    expect(stats.byStatus.backlog).toBe(1)
    expect(stats.byStatus.in_progress).toBe(1)
  })
})

describe('SqliteStore — project settings', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject()
  })

  afterEach(() => {
    store?.close()
  })

  it('getProjectSetting returns null for unknown key', () => {
    expect(store.getProjectSetting('foo')).toBeNull()
  })

  it('setProjectSetting and getProjectSetting round-trip', () => {
    store.setProjectSetting('theme', 'dark')
    expect(store.getProjectSetting('theme')).toBe('dark')
  })

  it('setProjectSetting overwrites existing value', () => {
    store.setProjectSetting('key', 'v1')
    store.setProjectSetting('key', 'v2')
    expect(store.getProjectSetting('key')).toBe('v2')
  })
})

describe('SqliteStore — import history', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject()
  })

  afterEach(() => {
    store?.close()
  })

  it('hasImport returns false before recording', () => {
    expect(store.hasImport('test.md')).toBe(false)
  })

  it('recordImport and hasImport round-trip', () => {
    store.recordImport('test.md', 5, 3)
    expect(store.hasImport('test.md')).toBe(true)
  })

  it('clearImportedNodes removes nodes and history', () => {
    const node = makeNode()
    node.sourceRef = { file: 'import.md' }
    store.insertNode(node)
    store.recordImport('import.md', 1, 0)
    const result = store.clearImportedNodes('import.md')
    expect(result.nodesDeleted).toBe(1)
    expect(store.hasImport('import.md')).toBe(false)
  })
})

describe('SqliteStore — toGraphDocument', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject()
  })

  afterEach(() => {
    store?.close()
  })

  it('throws when no project is active', () => {
    const empty = SqliteStore.open(':memory:')
    expect(() => empty.toGraphDocument()).toThrow(GraphNotInitializedError)
    empty.close()
  })

  it('returns complete document with nodes, edges, indexes', () => {
    const n1 = makeNode({ title: 'Task A', type: 'task' })
    const n2 = makeNode({ title: 'Task B', type: 'task' })
    const n3 = makeNode({ title: 'Epic', type: 'epic' })
    store.insertNode(n1)
    store.insertNode(n2)
    store.insertNode(n3)

    const e1 = makeEdge({ from: n1.id, to: n2.id, relationType: 'depends_on' })
    store.insertEdge(e1)
    store.recordImport('prd.md', 3, 1)

    const doc = store.toGraphDocument()
    expect(doc.version).toBe('1.0.0')
    expect(doc.project.name).toBe('Local MCP Graph')
    expect(doc.nodes).toHaveLength(3)
    expect(doc.edges).toHaveLength(1)
    expect(doc.indexes.byId).toBeDefined()
    expect(doc.meta.sourceFiles).toContain('prd.md')
  })
})

describe('SqliteStore — error handling', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject()
  })

  afterEach(() => {
    store?.close()
  })

  it('throws on oversized node metadata', () => {
    const node = makeNode({
      metadata: { data: 'x'.repeat(100_001) },
    })
    expect(() => store.insertNode(node)).toThrow(ValidationError)
  })

  it('throws on oversized edge metadata', () => {
    const n1 = makeNode()
    const n2 = makeNode()
    store.insertNode(n1)
    store.insertNode(n2)
    const edge = makeEdge({
      from: n1.id,
      to: n2.id,
      metadata: { data: 'x'.repeat(100_001) },
    })
    expect(() => store.insertEdge(edge)).toThrow(ValidationError)
  })

  it('withWriteLock runs function under mutex', async () => {
    const result = await store.withWriteLock(() => 'done')
    expect(result).toBe('done')
  })

  it('getStats returns in_progress count', () => {
    const n1 = makeNode({ status: 'in_progress' })
    const n2 = makeNode({ status: 'backlog' })
    const n3 = makeNode({ status: 'in_progress' })
    store.insertNode(n1)
    store.insertNode(n2)
    store.insertNode(n3)
    const stats = store.getStats()
    expect(stats.byStatus.in_progress).toBe(2)
    expect(stats.byStatus.backlog).toBe(1)
  })
})
