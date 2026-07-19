/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Surface-task self-declaration (node_919687afcea8): um leaf vira "surface" ao
 * ligar-se, por uma aresta JÁ válida (related_to|implements), a um nó de tipo
 * `scenario` ou `browser_test`. Sem a aresta é não-surface — comportamento de
 * hoje, `checks[]` do DoD byte-idêntico (default OFF/backward-compat).
 */
import { describe, it, expect } from 'vitest'
import type { GraphDocument, GraphNode, GraphEdge } from '../core/graph/graph-types.js'
import { isSurfaceTask } from '../core/implementer/surface-task.js'
import { checkDefinitionOfDone } from '../core/implementer/definition-of-done.js'

const NOW = '2026-07-17T00:00:00.000Z'

function task(id: string): GraphNode {
  return { id, type: 'task', title: `task ${id}`, status: 'backlog', priority: 3, createdAt: NOW, updatedAt: NOW }
}

function scenario(id: string): GraphNode {
  return {
    id,
    type: 'scenario',
    title: `scenario ${id}`,
    status: 'backlog',
    priority: 3,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function edge(from: string, to: string, relationType: GraphEdge['relationType']): GraphEdge {
  return { id: `edge_${from}_${to}`, from, to, relationType }
}

function doc(nodes: GraphNode[], edges: GraphEdge[]): GraphDocument {
  return { nodes, edges } as GraphDocument
}

describe('surface-task self-declaration (node_919687afcea8)', () => {
  // ─── isSurfaceTask helper ──────────────────────────────────────────────────
  it('AC1: task com aresta related_to a um nó scenario é reconhecida como surface', () => {
    const g = doc([task('t1'), scenario('s1')], [edge('t1', 's1', 'related_to')])
    expect(isSurfaceTask(g, 't1')).toBe(true)
  })

  it('AC1: task com aresta implements a um nó browser_test é surface', () => {
    const bt: GraphNode = { ...scenario('b1'), type: 'browser_test' }
    const g = doc([task('t1'), bt], [edge('t1', 'b1', 'implements')])
    expect(isSurfaceTask(g, 't1')).toBe(true)
  })

  it('AC2: task sem aresta a scenario/browser_test é não-surface', () => {
    const g = doc([task('t1'), task('t2')], [edge('t1', 't2', 'related_to')])
    expect(isSurfaceTask(g, 't1')).toBe(false)
  })

  it('AC2: aresta a scenario por um tipo não-declarante (depends_on) NÃO torna surface', () => {
    const g = doc([task('t1'), scenario('s1')], [edge('t1', 's1', 'depends_on')])
    expect(isSurfaceTask(g, 't1')).toBe(false)
  })

  // ─── recognition surfaces through checkDefinitionOfDone ────────────────────
  it('AC1: checkDefinitionOfDone marca isSurface=true quando a aresta existe', () => {
    const g = doc([task('t1'), scenario('s1')], [edge('t1', 's1', 'related_to')])
    expect(checkDefinitionOfDone(g, 't1').isSurface).toBe(true)
  })

  it('AC2: sem a aresta, isSurface=false e o array de checks é byte-idêntico ao baseline', () => {
    const surfaceDoc = doc([task('t1'), scenario('s1')], [edge('t1', 's1', 'related_to')])
    const plainDoc = doc([task('t1'), scenario('s1')], [])

    const surfaceReport = checkDefinitionOfDone(surfaceDoc, 't1')
    const plainReport = checkDefinitionOfDone(plainDoc, 't1')

    expect(plainReport.isSurface).toBe(false)
    // Gate byte-idêntico: reconhecer surface NÃO adiciona/remove nenhum check.
    expect(surfaceReport.checks).toEqual(plainReport.checks)
    expect(surfaceReport.score).toBe(plainReport.score)
    expect(surfaceReport.ready).toBe(plainReport.ready)
  })
})
