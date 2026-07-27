const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const fs = require('node:fs')

// The agent should create this file
let graphOps
try {
  graphOps = require('./graph-ops.js')
} catch {
  // Will be checked in the test
}

test('graph-ops.js exports createSampleGraph', () => {
  assert.ok(graphOps, 'graph-ops.js must exist and be require-able')
  assert.strictEqual(typeof graphOps.createSampleGraph, 'function', 'createSampleGraph must be a function')
})

test('createSampleGraph returns store with 2 nodes and 1 edge', () => {
  const store = graphOps.createSampleGraph()
  const stats = store.getStats()
  assert.strictEqual(stats.totalNodes, 2, 'must have exactly 2 nodes')
  assert.strictEqual(stats.totalEdges, 1, 'must have exactly 1 edge')
  store.close()
})

test('nodes have distinct types (task and epic)', () => {
  const store = graphOps.createSampleGraph()
  const nodes = store.getAllNodes()
  const types = nodes.map((n) => n.type).sort()
  assert.deepStrictEqual(types, ['epic', 'task'], 'nodes must be one epic and one task')
  store.close()
})

test('edge has correct relationType', () => {
  const store = graphOps.createSampleGraph()
  const edges = store.getAllEdges()
  assert.strictEqual(edges[0].relationType, 'depends_on', 'edge must be depends_on')
  store.close()
})

test('one node has status done', () => {
  const store = graphOps.createSampleGraph()
  const nodes = store.getAllNodes()
  const doneNodes = nodes.filter((n) => n.status === 'done')
  assert.ok(doneNodes.length >= 1, 'at least one node must have status done')
  store.close()
})

test('getStats returns correct counts', () => {
  const store = graphOps.createSampleGraph()
  const stats = graphOps.getStats(store)
  assert.ok(typeof stats.totalNodes === 'number', 'totalNodes must be a number')
  assert.ok(typeof stats.totalEdges === 'number', 'totalEdges must be a number')
  assert.ok(typeof stats.byType === 'object', 'byType must be an object')
  assert.ok(typeof stats.byStatus === 'object', 'byStatus must be an object')
  store.close()
})

test('graph-state.json exists with graph document', () => {
  const statePath = path.join(__dirname, 'graph-state.json')
  assert.ok(fs.existsSync(statePath), 'graph-state.json must exist')
  const content = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  assert.ok(content.nodes, 'graph-state.json must have nodes')
  assert.ok(content.edges, 'graph-state.json must have edges')
  assert.ok(content.nodes.length >= 2, 'graph must have at least 2 nodes')
})
