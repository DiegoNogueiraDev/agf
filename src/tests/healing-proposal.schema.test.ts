import { describe, it, expect } from 'vitest'
import {
  SuggestedActionKindSchema,
  SuggestedActionSchema,
  HealingProposalSchema,
} from '../schemas/healing-proposal.schema.js'

describe('SuggestedActionKindSchema', () => {
  it('accepts all action kinds', () => {
    for (const k of [
      'review_gate_config',
      'review_tool_input',
      'open_issue',
      'add_pattern_rule',
      'notify_operator',
      'decompose_task',
      'check_dependency',
    ]) {
      expect(SuggestedActionKindSchema.safeParse(k).success).toBe(true)
    }
  })

  it('rejects unknown kind', () => {
    expect(SuggestedActionKindSchema.safeParse('fix_automatically').success).toBe(false)
  })
})

describe('SuggestedActionSchema', () => {
  it('accepts a valid suggested action', () => {
    const result = SuggestedActionSchema.safeParse({
      kind: 'decompose_task',
      description: 'Split oversized task into subtasks',
      autoApplyable: false,
    })
    expect(result.success).toBe(true)
  })

  it('autoApplyable must be false (literal)', () => {
    expect(
      SuggestedActionSchema.safeParse({
        kind: 'open_issue',
        description: 'Create GitHub issue',
        autoApplyable: true,
      }).success,
    ).toBe(false)
  })
})

describe('HealingProposalSchema', () => {
  it('accepts a valid healing proposal', () => {
    expect(
      HealingProposalSchema.safeParse({
        id: 'proposal-001',
        pattern: 'test_failure_on_missing_dependency',
        signalCount: 3,
        windowSeconds: 300,
        evidence: [],
        suggestedActions: [
          {
            kind: 'check_dependency',
            description: 'Verify all dependencies are installed',
            autoApplyable: false,
          },
        ],
        confidence: 'heuristic',
        createdAt: '2026-06-22T00:00:00Z',
      }).success,
    ).toBe(true)
  })

  it('rejects proposal with empty suggestedActions', () => {
    expect(
      HealingProposalSchema.safeParse({
        id: 'p',
        pattern: 'pattern',
        signalCount: 0,
        windowSeconds: 60,
        evidence: [],
        suggestedActions: [],
        confidence: 'observed',
        createdAt: 'ts',
      }).success,
    ).toBe(false)
  })
})
