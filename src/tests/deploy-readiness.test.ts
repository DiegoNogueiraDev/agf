import { describe, it, expect } from 'vitest'
import { checkDeployReadiness } from '../core/deployer/deploy-readiness.js'
import { DeployReadinessError } from '../core/utils/errors.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(nodes: object[] = []): GraphDocument {
  return {
    version: 1,
    project: 'test',
    nodes: nodes as GraphDocument['nodes'],
    edges: [],
    indexes: { byId: {}, byType: {}, byStatus: {} },
    meta: {},
  } as unknown as GraphDocument
}

function makeTask(overrides: object = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    type: 'task',
    title: 'Task',
    status: 'done',
    acceptanceCriteria: ['ac1'],
    ...overrides,
  }
}

describe('checkDeployReadiness', () => {
  it('returns a report with checks array', () => {
    const report = checkDeployReadiness(makeDoc())
    expect(report).toHaveProperty('checks')
    expect(Array.isArray(report.checks)).toBe(true)
  })

  it('includes all_tasks_done check', () => {
    const doc = makeDoc([makeTask({ status: 'done' })])
    const report = checkDeployReadiness(doc)
    const check = report.checks.find((c) => c.name === 'all_tasks_done')
    expect(check).toBeTruthy()
    expect(check?.passed).toBe(true)
  })

  it('fails all_tasks_done check when a task is not done', () => {
    const doc = makeDoc([makeTask({ status: 'done' }), makeTask({ status: 'ready' })])
    const report = checkDeployReadiness(doc)
    const check = report.checks.find((c) => c.name === 'all_tasks_done')
    expect(check?.passed).toBe(false)
  })

  it('report includes a grade field', () => {
    const report = checkDeployReadiness(makeDoc())
    expect(report).toHaveProperty('grade')
  })

  it('report includes a score field', () => {
    const report = checkDeployReadiness(makeDoc())
    expect(typeof report.score).toBe('number')
  })

  it('throws DeployReadinessError when the document has no nodes', () => {
    expect(() => checkDeployReadiness({} as GraphDocument)).toThrow(DeployReadinessError)
  })

  it('throws DeployReadinessError when the document is undefined', () => {
    expect(() => checkDeployReadiness(undefined as unknown as GraphDocument)).toThrow(DeployReadinessError)
  })

  it('fails has_snapshot check by default and passes when hasSnapshots is true', () => {
    const withoutSnapshot = checkDeployReadiness(makeDoc())
    expect(withoutSnapshot.checks.find((c) => c.name === 'has_snapshot')?.passed).toBe(false)

    const withSnapshot = checkDeployReadiness(makeDoc(), { hasSnapshots: true })
    expect(withSnapshot.checks.find((c) => c.name === 'has_snapshot')?.passed).toBe(true)
  })

  it('fails knowledge_captured when knowledgeCount is 0 and passes when > 0', () => {
    const noKnowledge = checkDeployReadiness(makeDoc())
    expect(noKnowledge.checks.find((c) => c.name === 'knowledge_captured')?.passed).toBe(false)

    const withKnowledge = checkDeployReadiness(makeDoc(), { knowledgeCount: 2 })
    expect(withKnowledge.checks.find((c) => c.name === 'knowledge_captured')?.passed).toBe(true)
  })
})
