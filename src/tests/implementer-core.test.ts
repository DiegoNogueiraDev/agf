/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Testes de cobertura para implementer/, deployer/, listener/ — caminhos críticos
 * que não tinham testes dedicados.
 */
import { describe, it, expect } from 'vitest'
import { checkTddAdherence, generateTddHints, generateTddHintsFromTexts } from '../core/implementer/tdd-checker.js'
import { checkDeployReadiness } from '../core/deployer/deploy-readiness.js'
import { analyzeBacklogHealth } from '../core/listener/backlog-health.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

const ts = new Date().toISOString()

function makeDoc(nodes: GraphDocument['nodes'] = [], edges: GraphDocument['edges'] = []): GraphDocument {
  return {
    version: '1.0',
    project: { id: 'p1', name: 'test', createdAt: ts, updatedAt: ts },
    nodes,
    edges,
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

function makeNode(overrides: Partial<GraphDocument['nodes'][0]> = {}): GraphDocument['nodes'][0] {
  return {
    id: `n_${Math.random().toString(36).slice(2, 8)}`,
    type: 'task',
    title: 'Test Task',
    status: 'backlog',
    priority: 3,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  }
}

// ── implementer/tdd-checker.ts ──

describe('tdd-checker (caminho crítico TDD)', () => {
  it('checkTddAdherence retorna resumo vazio quando sem tasks com AC', () => {
    const doc = makeDoc([makeNode({ title: 'no AC' })])
    const r = checkTddAdherence(doc)
    expect(r.tasks).toEqual([])
    expect(r.summary).toContain('Nenhuma')
  })

  it('analisa tasks com GWT AC (linhas separadas) e sugere testes', () => {
    const doc = makeDoc([
      makeNode({
        id: 't1',
        title: 'Task com AC',
        acceptanceCriteria: [['Dado um valor válido', 'Quando calcular', 'Então retorna o resultado'].join('\n')],
      }),
    ])
    const r = checkTddAdherence(doc)
    expect(r.tasks.length).toBe(1)
    expect(r.overallTestability).toBeGreaterThan(0)
  })

  it('generateTddHints retorna array vazio sem ACs', () => {
    const node = makeNode()
    const hints = generateTddHints(node)
    expect(hints).toEqual([])
  })

  it('generateTddHintsFromTexts retorna vazio para array vazio', () => {
    const hints = generateTddHintsFromTexts([])
    expect(hints).toEqual([])
  })
})

// ── deployer/deploy-readiness.ts ──

describe('deploy-readiness (gate HANDOFF→DEPLOY)', () => {
  it('rejeita grafo inválido (sem nodes)', () => {
    expect(() => checkDeployReadiness(null as never)).toThrow()
  })

  it('all_tasks_done falha quando há tasks backlog', () => {
    const doc = makeDoc([makeNode({ status: 'backlog' })])
    const r = checkDeployReadiness(doc)
    const check = r.checks.find((c) => c.name === 'all_tasks_done')
    expect(check?.passed).toBe(false)
    expect(r.ready).toBe(false)
  })

  it('all_tasks_done passa quando todas tasks estão done', () => {
    const doc = makeDoc([makeNode({ status: 'done' })])
    const r = checkDeployReadiness(doc)
    const check = r.checks.find((c) => c.name === 'all_tasks_done')
    expect(check?.passed).toBe(true)
  })

  it('no_blocked_nodes falha quando há node bloqueado', () => {
    const doc = makeDoc([makeNode({ status: 'done' }), makeNode({ status: 'blocked', type: 'task' })])
    const r = checkDeployReadiness(doc)
    const check = r.checks.find((c) => c.name === 'no_blocked_nodes')
    expect(check?.passed).toBe(false)
  })

  it('has_snapshot falha sem snapshot', () => {
    const doc = makeDoc([makeNode({ status: 'done' })])
    const r = checkDeployReadiness(doc, { hasSnapshots: false })
    const check = r.checks.find((c) => c.name === 'has_snapshot')
    expect(check?.passed).toBe(false)
  })

  it('has_snapshot passa com snapshot', () => {
    const doc = makeDoc([makeNode({ status: 'done' })])
    const r = checkDeployReadiness(doc, { hasSnapshots: true })
    const check = r.checks.find((c) => c.name === 'has_snapshot')
    expect(check?.passed).toBe(true)
  })

  it('retorna grade e score', () => {
    const doc = makeDoc([makeNode({ status: 'done' })])
    const r = checkDeployReadiness(doc, { hasSnapshots: true })
    expect(r.score).toBeGreaterThanOrEqual(0)
    expect(r.grade).toBeTruthy()
    expect(r.summary).toContain('Deploy')
  })
})

// ── listener/backlog-health.ts ──

describe('backlog-health (análise de backlog)', () => {
  it('retorna health de backlog vazio', () => {
    const doc = makeDoc([])
    const r = analyzeBacklogHealth(doc)
    expect(r.backlogCount).toBe(0)
    expect(r.readyCount).toBe(0)
    expect(r.staleTasks).toEqual([])
  })

  it('conta tasks backlog e ready', () => {
    const doc = makeDoc([
      makeNode({ status: 'backlog' }),
      makeNode({ status: 'backlog' }),
      makeNode({ status: 'ready' }),
      makeNode({ status: 'in_progress' }),
    ])
    const r = analyzeBacklogHealth(doc)
    expect(r.backlogCount).toBe(2)
    expect(r.readyCount).toBe(1)
  })

  it('detecta tech debt por keywords', () => {
    const doc = makeDoc([
      makeNode({ title: 'Refactor database layer', status: 'backlog' }),
      makeNode({ title: 'Cleanup old code', status: 'backlog' }),
      makeNode({ title: 'Feature X', status: 'backlog' }),
    ])
    const r = analyzeBacklogHealth(doc)
    expect(r.techDebtIndicators.length).toBeGreaterThanOrEqual(2)
  })

  it('cleanForNewCycle true quando backlog saudável', () => {
    const doc = makeDoc([makeNode({ status: 'backlog' })])
    const r = analyzeBacklogHealth(doc)
    expect(r.cleanForNewCycle).toBe(true)
  })

  it('typeDistribution registra tipos corretos', () => {
    const doc = makeDoc([makeNode({ type: 'task', status: 'backlog' }), makeNode({ type: 'epic', status: 'backlog' })])
    const r = analyzeBacklogHealth(doc)
    expect(r.typeDistribution.task).toBe(1)
    expect(r.typeDistribution.epic).toBe(1)
  })

  it('priorityDistribution registra prioridades', () => {
    const doc = makeDoc([makeNode({ status: 'backlog', priority: 1 }), makeNode({ status: 'backlog', priority: 3 })])
    const r = analyzeBacklogHealth(doc)
    expect(r.priorityDistribution['1']).toBe(1)
    expect(r.priorityDistribution['3']).toBe(1)
  })
})
