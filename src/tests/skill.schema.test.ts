import { describe, it, expect } from 'vitest'
import {
  LifecyclePhaseEnum,
  SkillPreferenceSchema,
  SkillTriggerSchema,
  CustomSkillInputSchema,
} from '../schemas/skill.schema.js'

describe('LifecyclePhaseEnum', () => {
  it('accepts all lifecycle phases', () => {
    for (const p of [
      'ANALYZE',
      'DESIGN',
      'PLAN',
      'IMPLEMENT',
      'VALIDATE',
      'REVIEW',
      'HANDOFF',
      'DEPLOY',
      'LISTENING',
    ]) {
      expect(LifecyclePhaseEnum.safeParse(p).success).toBe(true)
    }
  })

  it('rejects unknown phase', () => {
    expect(LifecyclePhaseEnum.safeParse('EXECUTE').success).toBe(false)
  })
})

describe('SkillPreferenceSchema', () => {
  it('accepts valid skill preference', () => {
    expect(
      SkillPreferenceSchema.safeParse({
        projectId: 'proj-001',
        skillName: 'graph-implement',
        enabled: true,
        updatedAt: '2026-06-22T00:00:00Z',
      }).success,
    ).toBe(true)
  })
})

describe('SkillTriggerSchema', () => {
  it('accepts a trigger with event', () => {
    expect(
      SkillTriggerSchema.safeParse({
        event: 'task_started',
      }).success,
    ).toBe(true)
  })
})

describe('CustomSkillInputSchema', () => {
  it('accepts a minimal custom skill', () => {
    expect(
      CustomSkillInputSchema.safeParse({
        name: 'my-skill',
        description: 'A custom skill for testing workflows',
        phases: ['IMPLEMENT'],
        instructions: 'Follow these steps to implement the skill.',
      }).success,
    ).toBe(true)
  })
})
