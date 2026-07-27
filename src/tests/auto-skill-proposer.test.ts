import { describe, it, expect } from 'vitest'
import { proposeSkillFromTrajectory } from '../core/skills/auto-skill-proposer.js'
import type { ProposeSkillInput } from '../core/skills/auto-skill-proposer.js'

function makeInput(overrides: Partial<ProposeSkillInput> = {}): ProposeSkillInput {
  return {
    taskId: 'task-001',
    taskTitle: 'Add SQLite caching',
    taskDescription: 'Implement query caching using better-sqlite3',
    summary: 'Added an in-memory cache layer over SQLite reads',
    reasons: ['reduces query latency', 'idempotent reads'],
    ...overrides,
  }
}

describe('proposeSkillFromTrajectory', () => {
  it('returns a SkillProposal object', () => {
    const result = proposeSkillFromTrajectory(makeInput())
    expect(typeof result).toBe('object')
    expect(result).not.toBeNull()
  })

  it('returns a non-empty draft', () => {
    const result = proposeSkillFromTrajectory(makeInput())
    expect(typeof result.draft).toBe('string')
    expect(result.draft.length).toBeGreaterThan(0)
  })

  it('returns a domain string', () => {
    const result = proposeSkillFromTrajectory(makeInput())
    expect(typeof result.domain).toBe('string')
  })

  it('returns a topic string', () => {
    const result = proposeSkillFromTrajectory(makeInput())
    expect(typeof result.topic).toBe('string')
  })

  it('returns a confidence number between 0 and 1', () => {
    const result = proposeSkillFromTrajectory(makeInput())
    expect(typeof result.confidence).toBe('number')
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })

  it('infers sqlite-perf domain from SQLite title', () => {
    const result = proposeSkillFromTrajectory(
      makeInput({
        taskTitle: 'Optimize SQLite queries',
        taskDescription: 'better-sqlite3 WAL mode',
      }),
    )
    expect(result.domain).toBe('sqlite-perf')
  })

  it('infers rag domain from embedding description', () => {
    const result = proposeSkillFromTrajectory(
      makeInput({
        taskTitle: 'Build RAG pipeline',
        taskDescription: 'Embedding and retrieval for context',
      }),
    )
    expect(result.domain).toBe('rag')
  })

  it('falls back to general domain for unrecognized input', () => {
    const result = proposeSkillFromTrajectory(
      makeInput({
        taskTitle: 'Random task',
        taskDescription: 'Something unrelated',
      }),
    )
    expect(result.domain).toBe('general')
  })

  it('includes task title in draft', () => {
    const result = proposeSkillFromTrajectory(makeInput({ taskTitle: 'My Unique Task' }))
    expect(result.draft).toContain('My Unique Task')
  })
})
