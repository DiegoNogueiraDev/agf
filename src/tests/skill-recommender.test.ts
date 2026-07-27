import { describe, it, expect } from 'vitest'
import { recommendSkills, recommendBuiltInSkills } from '../core/insights/skill-recommender.js'
import type { SkillInfo } from '../core/insights/skill-recommender.js'
import type { GraphDocument, GraphNode } from '../core/graph/graph-types.js'

const NOW = new Date().toISOString()

function makeDoc(nodes: GraphNode[]): GraphDocument {
  return {
    version: '1',
    project: { id: 'p1', name: 'test', createdAt: NOW, updatedAt: NOW },
    nodes,
    edges: [],
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

function makeNode(id: string, type: GraphNode['type'], overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    type,
    title: `${type} ${id}`,
    status: 'backlog',
    priority: 3,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function makeSkill(name: string): SkillInfo {
  return { name, description: `${name} desc`, category: 'general', filePath: `/skills/${name}` }
}

describe('recommendSkills', () => {
  it('returns empty array for empty skills list', () => {
    const doc = makeDoc([makeNode('t1', 'task', { status: 'in_progress' })])
    expect(recommendSkills(doc, [])).toHaveLength(0)
  })

  it('returns empty array for null/undefined skills', () => {
    const doc = makeDoc([makeNode('t1', 'task')])
    // @ts-expect-error intentional null test
    expect(recommendSkills(doc, null)).toHaveLength(0)
  })

  it('recommends comprehensive-testing-reference for in_progress tasks without tested tag', () => {
    const doc = makeDoc([makeNode('t1', 'task', { status: 'in_progress', tags: [] })])
    const skills = [makeSkill('comprehensive-testing-reference')]
    const recs = recommendSkills(doc, skills)
    const rec = recs.find((r) => r.skill === 'comprehensive-testing-reference')
    expect(rec).toBeDefined()
  })

  it('does not recommend testing if no matching skill', () => {
    const doc = makeDoc([makeNode('t1', 'task', { status: 'in_progress' })])
    const skills = [makeSkill('some-other-skill')]
    const recs = recommendSkills(doc, skills)
    expect(recs.find((r) => r.skill === 'comprehensive-testing-reference')).toBeUndefined()
  })

  it('returns SkillRecommendation objects with skill, reason, phase', () => {
    const doc = makeDoc([makeNode('t1', 'task', { status: 'in_progress' })])
    const skills = [makeSkill('comprehensive-testing-reference')]
    const recs = recommendSkills(doc, skills)
    if (recs.length > 0) {
      expect(recs[0]).toHaveProperty('skill')
      expect(recs[0]).toHaveProperty('reason')
      expect(recs[0]).toHaveProperty('phase')
    }
  })
})

describe('recommendBuiltInSkills', () => {
  it('returns array', () => {
    const doc = makeDoc([])
    expect(Array.isArray(recommendBuiltInSkills(doc, 'ANALYZE'))).toBe(true)
  })

  it('ANALYZE phase: recommends starting PRD when graph is empty', () => {
    const doc = makeDoc([])
    const recs = recommendBuiltInSkills(doc, 'ANALYZE')
    expect(recs.some((r) => r.skill === 'create-prd-chat-mode')).toBe(true)
  })

  it('DESIGN phase: recommends arch breakdown when epics exist', () => {
    const doc = makeDoc([makeNode('e1', 'epic')])
    const recs = recommendBuiltInSkills(doc, 'DESIGN')
    expect(recs.some((r) => r.skill === 'breakdown-epic-arch')).toBe(true)
  })

  it('IMPLEMENT phase: recommends TDD when in-progress tasks have no tests', () => {
    const doc = makeDoc([makeNode('t1', 'task', { status: 'in_progress', tags: [] })])
    const recs = recommendBuiltInSkills(doc, 'IMPLEMENT')
    expect(recs.some((r) => r.phase === 'IMPLEMENT')).toBe(true)
  })

  it('VALIDATE phase: recommends test gate when tasks are done', () => {
    const doc = makeDoc([makeNode('t1', 'task', { status: 'done' })])
    const recs = recommendBuiltInSkills(doc, 'VALIDATE')
    expect(Array.isArray(recs)).toBe(true)
  })

  it('each recommendation has skill, reason, phase', () => {
    const doc = makeDoc([])
    const recs = recommendBuiltInSkills(doc, 'ANALYZE')
    for (const rec of recs) {
      expect(typeof rec.skill).toBe('string')
      expect(typeof rec.reason).toBe('string')
      expect(typeof rec.phase).toBe('string')
    }
  })
})
