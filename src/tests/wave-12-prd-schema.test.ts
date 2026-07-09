import { describe, it, expect } from 'vitest'
import { Wave12GoalSchema } from '../schemas/wave-12-prd-schema.js'

describe('Wave12GoalSchema', () => {
  const VALID_GOAL = {
    id: 'goal-isolation-quality',
    title: 'Achieve 100% build validation isolation',
    description: 'Ensures all builds run in fully isolated environments, preventing cross-test contamination.',
    specific: 'Every build step runs in a dedicated container with no shared mutable state between test runs.',
    measurable: 'Zero cross-test contamination incidents per sprint',
    achievable: 'Docker-based isolation can be implemented in two sprints with current team capacity.',
    relevant: 'Isolation quality is critical for Wave-12 reliability and mcp-graph reproducibility.',
    timebound: 'Q3 2026',
    category: 'isolation_quality',
  }

  it('accepts a valid goal', () => {
    const result = Wave12GoalSchema.safeParse(VALID_GOAL)
    expect(result.success).toBe(true)
  })

  it('rejects id without goal- prefix', () => {
    expect(
      Wave12GoalSchema.safeParse({
        ...VALID_GOAL,
        id: 'isolation-quality',
      }).success,
    ).toBe(false)
  })

  it('rejects short title (< 10 chars)', () => {
    expect(
      Wave12GoalSchema.safeParse({
        id: 'goal-x',
        title: 'Short',
        metric: 'metric',
        target: 'target',
        deadline: 'date',
      }).success,
    ).toBe(false)
  })
})
