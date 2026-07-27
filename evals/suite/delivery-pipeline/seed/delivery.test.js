const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const fs = require('node:fs')

// Pipeline step: import — graph has nodes
test('import: graph-state.json exists with nodes', () => {
  const statePath = path.join(__dirname, 'graph-state.json')
  assert.ok(fs.existsSync(statePath), 'graph-state.json must exist after pipeline run')
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  assert.ok(state.nodes, 'graph-state must have nodes array')
  assert.ok(state.nodes.length >= 1, 'graph must have at least 1 node')
})

// Pipeline step: decompose — graph has task/subtask nodes
test('decompose: graph has task and subtask nodes (decomposition)', () => {
  const statePath = path.join(__dirname, 'graph-state.json')
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  const types = state.nodes.map((n) => n.type)
  assert.ok(
    types.includes('task') || types.includes('subtask'),
    'graph must contain task or subtask nodes from decomposition',
  )
  assert.ok(state.nodes.length >= 2, 'must have at least 2 total nodes (requirement + task)')
})

// Pipeline step: implement — code files were created
test('implement: user-ops.js exports validateUsername and greetUser', () => {
  const mod = require('./user-ops.js')
  assert.ok(mod, 'user-ops.js must exist (implement step ran)')
  assert.strictEqual(typeof mod.validateUsername, 'function', 'validateUsername must be a function')
  assert.strictEqual(typeof mod.greetUser, 'function', 'greetUser must be a function')

  assert.strictEqual(mod.validateUsername('Alice'), true, 'valid name returns true')
  assert.strictEqual(mod.validateUsername(''), false, 'empty string returns false')
  assert.strictEqual(mod.validateUsername('A'), false, 'single char returns false')
  assert.strictEqual(mod.validateUsername(123), false, 'non-string returns false')

  assert.strictEqual(mod.greetUser('Alice'), 'Welcome, Alice!', 'correct greeting')
  assert.strictEqual(mod.greetUser('Bob'), 'Welcome, Bob!', 'correct greeting for Bob')
  assert.throws(() => mod.greetUser(''), /invalid/i, 'throws on empty name')
  assert.throws(() => mod.greetUser('A'), /invalid/i, 'throws on short name')
})

// Pipeline step: done — at least one node reached done status
test('done: at least one node reached done status', () => {
  const statePath = path.join(__dirname, 'graph-state.json')
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  const doneNodes = state.nodes.filter((n) => n.status === 'done')
  assert.ok(doneNodes.length > 0, 'at least one node must have status done (done step ran)')
})

// Pipeline consistency: edges connect the nodes
test('pipeline integrity: graph has edges connecting nodes', () => {
  const statePath = path.join(__dirname, 'graph-state.json')
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  assert.ok(state.edges, 'graph-state must have edges array')
  assert.ok(Array.isArray(state.edges), 'edges must be an array')
  assert.ok(state.edges.length > 0, 'graph must have at least 1 edge')
})
