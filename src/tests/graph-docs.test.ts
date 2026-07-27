/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { generateGraphDocs, type DocGraph } from '../core/docs/graph-docs.js'

const graph: DocGraph = {
  project: { name: 'agent-graph-flow' },
  nodes: [
    { id: 'e1', type: 'epic', title: 'Auth epic', status: 'in_progress' },
    { id: 't1', type: 'task', title: 'Login form', status: 'done', parentId: 'e1', ac: ['renders', 'submits'] },
    { id: 't2', type: 'task', title: 'Logout', status: 'backlog', parentId: 'e1', ac: ['clears session'] },
    { id: 'r1', type: 'requirement', title: 'Must persist sessions', status: 'backlog' },
    { id: 'orphan', type: 'task', title: 'Standalone task', status: 'blocked' },
  ],
}

describe('generateGraphDocs', () => {
  it('renders the project name as the top heading', () => {
    const md = generateGraphDocs(graph)
    expect(md).toMatch(/^# agent-graph-flow/m)
  })

  it('includes an overview with status counts', () => {
    const md = generateGraphDocs(graph)
    expect(md).toMatch(/done/i)
    expect(md).toContain('5') // total nodes
  })

  it('nests tasks under their epic with a status marker', () => {
    const md = generateGraphDocs(graph)
    const epicIdx = md.indexOf('Auth epic')
    const taskIdx = md.indexOf('Login form')
    expect(epicIdx).toBeGreaterThanOrEqual(0)
    expect(taskIdx).toBeGreaterThan(epicIdx)
    expect(md).toMatch(/✓.*Login form|Login form.*done/i)
  })

  it('shows AC counts for tasks that have them', () => {
    const md = generateGraphDocs(graph)
    expect(md).toMatch(/Login form.*2|2 AC/i)
  })

  it('lists requirements', () => {
    const md = generateGraphDocs(graph)
    expect(md).toContain('Must persist sessions')
  })

  it('surfaces tasks with no parent epic (orphans)', () => {
    const md = generateGraphDocs(graph)
    expect(md).toContain('Standalone task')
  })

  it('is deterministic — same graph yields byte-identical output', () => {
    expect(generateGraphDocs(graph)).toBe(generateGraphDocs(graph))
  })

  it('handles an empty graph without throwing', () => {
    const md = generateGraphDocs({ project: { name: 'empty' }, nodes: [] })
    expect(md).toMatch(/^# empty/m)
    expect(typeof md).toBe('string')
  })
})
