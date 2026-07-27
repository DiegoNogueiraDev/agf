import { describe, it, expect } from 'vitest'
import { HealingIssueTypeSchema, HealingSeveritySchema, HealingIssueSchema } from '../schemas/healing.schema.js'

describe('HealingIssueTypeSchema', () => {
  it('accepts all issue types', () => {
    for (const t of [
      'stuck_task',
      'broken_dependency',
      'orphan_node',
      'stale_in_progress',
      'cycle_detected',
      'missing_ac',
      'oversized_undecomposed',
      'blocked_no_blocker',
      'done_with_pending_deps',
    ]) {
      expect(HealingIssueTypeSchema.safeParse(t).success).toBe(true)
    }
  })

  it('rejects unknown type', () => {
    expect(HealingIssueTypeSchema.safeParse('timeout').success).toBe(false)
  })
})

describe('HealingSeveritySchema', () => {
  it('accepts all severities', () => {
    for (const s of ['critical', 'high', 'medium', 'low']) {
      expect(HealingSeveritySchema.safeParse(s).success).toBe(true)
    }
  })
})

describe('HealingIssueSchema', () => {
  it('accepts a valid healing issue', () => {
    const result = HealingIssueSchema.safeParse({
      id: 'issue-001',
      type: 'stuck_task',
      severity: 'high',
      nodeId: 'node_abc',
      title: 'Task stuck in progress',
      message: 'Task has been in_progress for 48h',
      detectedAt: '2026-06-22T00:00:00Z',
    })
    expect(result.success).toBe(true)
  })

  it('accepts issue without optional suggestion', () => {
    expect(
      HealingIssueSchema.safeParse({
        id: 'i',
        type: 'orphan_node',
        severity: 'low',
        nodeId: 'n',
        title: 't',
        message: 'm',
        detectedAt: 'ts',
      }).success,
    ).toBe(true)
  })
})
