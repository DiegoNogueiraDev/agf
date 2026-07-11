/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Schema validation tests — batch 7: guardian-reviewer, handoff-schema,
 * healing-proposal, healing, honcho
 */

import { describe, it, expect } from 'vitest'
import type {
  GuardianVerdict,
  ToolCallToReview,
  ReviewContext,
  GuardianConfig,
  GuardianReviewerInterface,
} from '../schemas/guardian-reviewer.schema.js'
import {
  DocCompletenessNodeSchema,
  DocCompletenessReportSchema,
  HandoffReadinessCheckSchema,
  HandoffReadinessReportSchema,
} from '../schemas/handoff-schema.js'
import {
  HealingProposalSchema,
  SuggestedActionSchema,
  SuggestedActionKindSchema,
} from '../schemas/healing-proposal.schema.js'
import {
  HealingIssueSchema,
  HealingActionSchema,
  HealingResultSchema,
  HealingMetricsSchema,
  HealingReportSchema,
  HealingConfigSchema,
  HealingIssueTypeSchema,
  HealingSeveritySchema,
  HealingActionTypeSchema,
} from '../schemas/healing.schema.js'
import { HonchoConfigSchema, UserRepresentationSchema, PeerObservationSchema } from '../schemas/honcho.schema.js'

// ── guardian-reviewer (types only, no Zod schemas) ──

describe('GuardianReviewerInterface type', () => {
  it('should allow constructing a valid verdict', () => {
    const verdict: GuardianVerdict = { verdict: 'allow', reason: 'OK', risk: 'low' }
    expect(verdict.verdict).toBe('allow')
  })

  it('should accept all verdict variants', () => {
    const allow: GuardianVerdict = { verdict: 'allow', reason: '', risk: 'low' }
    const deny: GuardianVerdict = { verdict: 'deny', reason: 'blocked', risk: 'high' }
    const ask: GuardianVerdict = { verdict: 'ask_user', reason: 'check', risk: 'medium' }
    expect(allow.verdict).toBe('allow')
    expect(deny.verdict).toBe('deny')
    expect(ask.verdict).toBe('ask_user')
  })

  it('should accept all risk levels', () => {
    expect({ verdict: 'allow' as const, reason: '', risk: 'low' as const }.risk).toBe('low')
    expect({ verdict: 'allow' as const, reason: '', risk: 'medium' as const }.risk).toBe('medium')
    expect({ verdict: 'allow' as const, reason: '', risk: 'high' as const }.risk).toBe('high')
  })

  it('should accept ToolCallToReview', () => {
    const call: ToolCallToReview = { toolName: 'bash', args: { command: 'ls' } }
    expect(call.toolName).toBe('bash')
  })

  it('should accept ReviewContext', () => {
    const ctx: ReviewContext = { taskTitle: 'Test', phase: 'IMPLEMENT', userIntent: 'debug' }
    expect(ctx.phase).toBe('IMPLEMENT')
  })

  it('should accept GuardianConfig', () => {
    const cfg: GuardianConfig = { model: 'haiku', timeoutMs: 5000, cacheSize: 100 }
    expect(cfg.model).toBe('haiku')
  })

  it('should accept minimal GuardianConfig', () => {
    const cfg: GuardianConfig = { model: 'sonnet' }
    expect(cfg.model).toBe('sonnet')
  })

  it('should implement GuardianReviewerInterface', () => {
    const reviewer: GuardianReviewerInterface = {
      async review() {
        return { verdict: 'allow', reason: '', risk: 'low' }
      },
      clearCache() {},
    }
    expect(typeof reviewer.review).toBe('function')
    expect(typeof reviewer.clearCache).toBe('function')
  })
})

// ── handoff-schema ──

describe('DocCompletenessNodeSchema', () => {
  it('should accept valid node', () => {
    const node = DocCompletenessNodeSchema.parse({ nodeId: 'n1', title: 'Task A' })
    expect(node.nodeId).toBe('n1')
  })

  it('should reject missing fields', () => {
    expect(() => DocCompletenessNodeSchema.parse({})).toThrow()
    expect(() => DocCompletenessNodeSchema.parse({ nodeId: 'n1' })).toThrow()
  })
})

describe('DocCompletenessReportSchema', () => {
  it('should accept valid report', () => {
    const report = DocCompletenessReportSchema.parse({
      descriptionsPresent: 5,
      totalNodes: 10,
      coverageRate: 50,
      nodesWithoutDescription: [],
    })
    expect(report.coverageRate).toBe(50)
  })

  it('should accept non-empty list', () => {
    const report = DocCompletenessReportSchema.parse({
      descriptionsPresent: 0,
      totalNodes: 1,
      coverageRate: 0,
      nodesWithoutDescription: [{ nodeId: 'n1', title: 'No Desc' }],
    })
    expect(report.nodesWithoutDescription).toHaveLength(1)
  })

  it('should reject negative values', () => {
    expect(() =>
      DocCompletenessReportSchema.parse({
        descriptionsPresent: -1,
        totalNodes: 10,
        coverageRate: 50,
        nodesWithoutDescription: [],
      }),
    ).toThrow()
  })

  it('should reject coverageRate > 100', () => {
    expect(() =>
      DocCompletenessReportSchema.parse({
        descriptionsPresent: 10,
        totalNodes: 10,
        coverageRate: 150,
        nodesWithoutDescription: [],
      }),
    ).toThrow()
  })
})

describe('HandoffReadinessCheckSchema', () => {
  it('should accept valid check', () => {
    const check = HandoffReadinessCheckSchema.parse({
      name: 'doc-check',
      passed: true,
      details: 'all good',
      severity: 'required',
    })
    expect(check.name).toBe('doc-check')
  })

  it('should accept recommended severity', () => {
    const check = HandoffReadinessCheckSchema.parse({
      name: 'nice-to-have',
      passed: false,
      details: 'missing',
      severity: 'recommended',
    })
    expect(check.severity).toBe('recommended')
  })

  it('should reject invalid severity', () => {
    expect(() =>
      HandoffReadinessCheckSchema.parse({
        name: 'x',
        passed: true,
        details: '',
        severity: 'invalid',
      }),
    ).toThrow()
  })
})

describe('HandoffReadinessReportSchema', () => {
  it('should accept valid report', () => {
    const report = HandoffReadinessReportSchema.parse({
      checks: [],
      ready: true,
      score: 85,
      grade: 'B',
      summary: 'ready to handoff',
    })
    expect(report.ready).toBe(true)
  })

  it('should reject score > 100', () => {
    expect(() =>
      HandoffReadinessReportSchema.parse({
        checks: [],
        ready: true,
        score: 101,
        grade: 'A',
        summary: '',
      }),
    ).toThrow()
  })

  it('should reject invalid grade', () => {
    expect(() =>
      HandoffReadinessReportSchema.parse({
        checks: [],
        ready: true,
        score: 50,
        grade: 'X',
        summary: '',
      }),
    ).toThrow()
  })
})

// ── healing-proposal ──

describe('SuggestedActionKindSchema', () => {
  it('should accept valid kinds', () => {
    expect(SuggestedActionKindSchema.parse('review_gate_config')).toBe('review_gate_config')
    expect(SuggestedActionKindSchema.parse('open_issue')).toBe('open_issue')
    expect(SuggestedActionKindSchema.parse('decompose_task')).toBe('decompose_task')
  })

  it('should reject invalid kind', () => {
    expect(() => SuggestedActionKindSchema.parse('invalid_action')).toThrow()
  })
})

describe('SuggestedActionSchema', () => {
  it('should accept valid action', () => {
    const action = SuggestedActionSchema.parse({
      kind: 'open_issue',
      description: 'Create bug ticket',
      autoApplyable: false,
    })
    expect(action.kind).toBe('open_issue')
  })

  it('should reject autoApplyable true', () => {
    expect(() =>
      SuggestedActionSchema.parse({
        kind: 'open_issue',
        description: 'test',
        autoApplyable: true,
      }),
    ).toThrow()
  })

  it('should reject empty description', () => {
    expect(() =>
      SuggestedActionSchema.parse({
        kind: 'open_issue',
        description: '',
        autoApplyable: false,
      }),
    ).toThrow()
  })
})

describe('HealingProposalSchema', () => {
  const validProposal = {
    id: 'prop-1',
    pattern: 'stuck_task',
    signalCount: 3,
    windowSeconds: 3600,
    evidence: [],
    suggestedActions: [{ kind: 'open_issue', description: 'Create ticket', autoApplyable: false }],
    confidence: 'observed',
    createdAt: '2024-01-01T00:00:00Z',
  }

  it('should accept valid proposal', () => {
    const p = HealingProposalSchema.parse(validProposal)
    expect(p.id).toBe('prop-1')
  })

  it('should accept heuristic confidence', () => {
    const p = HealingProposalSchema.parse({ ...validProposal, confidence: 'heuristic' })
    expect(p.confidence).toBe('heuristic')
  })

  it('should reject invalid confidence', () => {
    expect(() => HealingProposalSchema.parse({ ...validProposal, confidence: 'inferred' })).toThrow()
  })

  it('should reject empty id', () => {
    expect(() => HealingProposalSchema.parse({ ...validProposal, id: '' })).toThrow()
  })

  it('should reject empty suggestedActions', () => {
    expect(() => HealingProposalSchema.parse({ ...validProposal, suggestedActions: [] })).toThrow()
  })

  it('should reject negative signalCount', () => {
    expect(() => HealingProposalSchema.parse({ ...validProposal, signalCount: -1 })).toThrow()
  })
})

// ── healing.schema ──

describe('HealingIssueTypeSchema', () => {
  it('should accept valid issue types', () => {
    expect(HealingIssueTypeSchema.parse('stuck_task')).toBe('stuck_task')
    expect(HealingIssueTypeSchema.parse('cycle_detected')).toBe('cycle_detected')
    expect(HealingIssueTypeSchema.parse('done_with_pending_deps')).toBe('done_with_pending_deps')
  })

  it('should reject invalid type', () => {
    expect(() => HealingIssueTypeSchema.parse('unknown')).toThrow()
  })
})

describe('HealingSeveritySchema', () => {
  it('should accept all severities', () => {
    expect(HealingSeveritySchema.parse('critical')).toBe('critical')
    expect(HealingSeveritySchema.parse('high')).toBe('high')
    expect(HealingSeveritySchema.parse('medium')).toBe('medium')
    expect(HealingSeveritySchema.parse('low')).toBe('low')
  })

  it('should reject invalid severity', () => {
    expect(() => HealingSeveritySchema.parse('urgent')).toThrow()
  })
})

describe('HealingIssueSchema', () => {
  it('should accept valid issue', () => {
    const issue = HealingIssueSchema.parse({
      id: 'iss-1',
      type: 'stuck_task',
      severity: 'high',
      nodeId: 'n1',
      title: 'Stuck task',
      message: 'In progress > 48h',
      detectedAt: 't1',
    })
    expect(issue.type).toBe('stuck_task')
  })

  it('should accept optional suggestion', () => {
    const issue = HealingIssueSchema.parse({
      id: 'iss-2',
      type: 'orphan_node',
      severity: 'medium',
      nodeId: 'n2',
      title: 'Orphan',
      message: 'No parent',
      suggestion: 'Add parent edge',
      detectedAt: 't1',
    })
    expect(issue.suggestion).toBe('Add parent edge')
  })

  it('should reject missing required fields', () => {
    expect(() => HealingIssueSchema.parse({ id: 'x' })).toThrow()
  })
})

describe('HealingActionTypeSchema', () => {
  it('should accept valid action types', () => {
    expect(HealingActionTypeSchema.parse('update_status')).toBe('update_status')
    expect(HealingActionTypeSchema.parse('flag_for_review')).toBe('flag_for_review')
  })
})

describe('HealingActionSchema', () => {
  it('should accept valid action', () => {
    const action = HealingActionSchema.parse({
      id: 'act-1',
      issueId: 'iss-1',
      type: 'update_status',
      nodeId: 'n1',
      description: 'Mark done',
    })
    expect(action.description).toBe('Mark done')
  })

  it('should accept optional params', () => {
    const action = HealingActionSchema.parse({
      id: 'act-2',
      issueId: 'iss-1',
      type: 'add_flag',
      nodeId: 'n1',
      description: 'Flag',
      params: { flag: 'review' },
    })
    expect(action.params?.flag).toBe('review')
  })
})

describe('HealingResultSchema', () => {
  it('should accept valid result', () => {
    const r = HealingResultSchema.parse({
      actionId: 'act-1',
      issueId: 'iss-1',
      success: true,
      message: 'done',
      appliedAt: 't1',
    })
    expect(r.success).toBe(true)
  })
})

describe('HealingMetricsSchema', () => {
  it('should accept valid metrics', () => {
    const m = HealingMetricsSchema.parse({
      totalIssuesDetected: 10,
      totalHealed: 8,
      totalFailed: 2,
      successRate: 0.8,
      avgResolutionMs: 500,
      bySeverity: { critical: 1, high: 2, medium: 3, low: 4 },
      byIssueType: {
        stuck_task: 5,
        orphan_node: 3,
        cycle_detected: 2,
        broken_dependency: 0,
        stale_in_progress: 0,
        missing_ac: 0,
        oversized_undecomposed: 0,
        blocked_no_blocker: 0,
        done_with_pending_deps: 0,
        container_epic_blocking: 0,
        stale_resolved_risk: 0,
      },
    })
    expect(m.successRate).toBe(0.8)
  })

  it('should reject successRate > 1', () => {
    expect(() =>
      HealingMetricsSchema.parse({
        totalIssuesDetected: 1,
        totalHealed: 1,
        totalFailed: 0,
        successRate: 1.5,
        avgResolutionMs: 0,
        bySeverity: { critical: 0, high: 0, medium: 0, low: 1 },
        byIssueType: {
          stuck_task: 1,
          orphan_node: 0,
          cycle_detected: 0,
          broken_dependency: 0,
          stale_in_progress: 0,
          missing_ac: 0,
          oversized_undecomposed: 0,
          blocked_no_blocker: 0,
          done_with_pending_deps: 0,
          container_epic_blocking: 0,
        },
      }),
    ).toThrow()
  })

  it('should reject negative numbers', () => {
    expect(() =>
      HealingMetricsSchema.parse({
        totalIssuesDetected: -1,
        totalHealed: 0,
        totalFailed: 0,
        successRate: 0,
        avgResolutionMs: 0,
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
        byIssueType: {
          stuck_task: 0,
          orphan_node: 0,
          cycle_detected: 0,
          broken_dependency: 0,
          stale_in_progress: 0,
          missing_ac: 0,
          oversized_undecomposed: 0,
          blocked_no_blocker: 0,
          done_with_pending_deps: 0,
          container_epic_blocking: 0,
        },
      }),
    ).toThrow()
  })
})

describe('HealingReportSchema', () => {
  it('should accept valid report', () => {
    const report = HealingReportSchema.parse({
      id: 'r1',
      timestamp: 't1',
      issues: [],
      actions: [],
      results: [],
      metrics: {
        totalIssuesDetected: 0,
        totalHealed: 0,
        totalFailed: 0,
        successRate: 1,
        avgResolutionMs: 0,
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
        byIssueType: {
          stuck_task: 0,
          orphan_node: 0,
          cycle_detected: 0,
          broken_dependency: 0,
          stale_in_progress: 0,
          missing_ac: 0,
          oversized_undecomposed: 0,
          blocked_no_blocker: 0,
          done_with_pending_deps: 0,
          container_epic_blocking: 0,
          stale_resolved_risk: 0,
        },
      },
    })
    expect(report.id).toBe('r1')
  })
})

describe('HealingConfigSchema', () => {
  it('should apply defaults', () => {
    const cfg = HealingConfigSchema.parse({})
    expect(cfg.staleHours).toBe(48)
    expect(cfg.maxCycleDepth).toBe(10)
    expect(cfg.autoHeal).toBe(false)
    expect(cfg.dryRun).toBe(true)
  })

  it('should accept custom values', () => {
    const cfg = HealingConfigSchema.parse({ staleHours: 24, maxCycleDepth: 5, autoHeal: true, dryRun: false })
    expect(cfg.staleHours).toBe(24)
    expect(cfg.maxCycleDepth).toBe(5)
    expect(cfg.autoHeal).toBe(true)
    expect(cfg.dryRun).toBe(false)
  })

  it('should reject staleHours < 1', () => {
    expect(() => HealingConfigSchema.parse({ staleHours: 0 })).toThrow()
  })

  it('should reject maxCycleDepth < 2', () => {
    expect(() => HealingConfigSchema.parse({ maxCycleDepth: 1 })).toThrow()
  })
})

// ── honcho.schema ──

describe('HonchoConfigSchema', () => {
  it('should accept valid config', () => {
    const cfg = HonchoConfigSchema.parse({
      apiUrl: 'https://honcho.example.com',
      dialecticDepth: 2,
      sessionResolution: 'per-session',
      observationMode: 'directional',
    })
    expect(cfg.apiUrl).toBe('https://honcho.example.com')
  })

  it('should accept dialecticDepth 1 and 3', () => {
    expect(
      HonchoConfigSchema.parse({
        apiUrl: 'u',
        dialecticDepth: 1,
        sessionResolution: 'global',
        observationMode: 'unified',
      }).dialecticDepth,
    ).toBe(1)
    expect(
      HonchoConfigSchema.parse({
        apiUrl: 'u',
        dialecticDepth: 3,
        sessionResolution: 'global',
        observationMode: 'unified',
      }).dialecticDepth,
    ).toBe(3)
  })

  it('should accept all session resolutions', () => {
    for (const r of ['per-directory', 'per-session', 'per-repo', 'global'] as const) {
      const cfg = HonchoConfigSchema.parse({
        apiUrl: 'u',
        dialecticDepth: 1,
        sessionResolution: r,
        observationMode: 'directional',
      })
      expect(cfg.sessionResolution).toBe(r)
    }
  })

  it('should reject invalid dialecticDepth', () => {
    expect(() =>
      HonchoConfigSchema.parse({
        apiUrl: 'u',
        dialecticDepth: 4,
        sessionResolution: 'global',
        observationMode: 'directional',
      }),
    ).toThrow()
  })

  it('should reject invalid sessionResolution', () => {
    expect(() =>
      HonchoConfigSchema.parse({
        apiUrl: 'u',
        dialecticDepth: 1,
        sessionResolution: 'invalid',
        observationMode: 'directional',
      }),
    ).toThrow()
  })

  it('should reject invalid observationMode', () => {
    expect(() =>
      HonchoConfigSchema.parse({
        apiUrl: 'u',
        dialecticDepth: 1,
        sessionResolution: 'global',
        observationMode: 'hybrid',
      }),
    ).toThrow()
  })
})

describe('UserRepresentationSchema', () => {
  it('should accept valid user', () => {
    const u = UserRepresentationSchema.parse({
      userId: 'u1',
      updatedAt: '2024-01-01',
    })
    expect(u.userId).toBe('u1')
    expect(u.preferences).toEqual({})
  })

  it('should accept with observations', () => {
    const u = UserRepresentationSchema.parse({
      userId: 'u2',
      updatedAt: 't1',
      observations: ['obs1', 'obs2'],
    })
    expect(u.observations).toHaveLength(2)
  })

  it('should accept with preferences', () => {
    const u = UserRepresentationSchema.parse({
      userId: 'u3',
      preferences: { theme: 'dark' },
      updatedAt: 't1',
    })
    expect(u.preferences.theme).toBe('dark')
  })

  it('should reject missing userId', () => {
    expect(() => UserRepresentationSchema.parse({ updatedAt: 't1' })).toThrow()
  })
})

describe('PeerObservationSchema', () => {
  it('should accept valid observation', () => {
    const o = PeerObservationSchema.parse({
      observerId: 'agent-1',
      targetId: 'agent-2',
      observation: 'fast responses',
      ts: 't1',
    })
    expect(o.confidence).toBe(1)
  })

  it('should accept custom confidence', () => {
    const o = PeerObservationSchema.parse({
      observerId: 'a1',
      targetId: 'a2',
      observation: 'slow',
      confidence: 0.5,
      ts: 't1',
    })
    expect(o.confidence).toBe(0.5)
  })

  it('should reject confidence < 0', () => {
    expect(() =>
      PeerObservationSchema.parse({
        observerId: 'a1',
        targetId: 'a2',
        observation: 'x',
        confidence: -0.1,
        ts: 't1',
      }),
    ).toThrow()
  })

  it('should reject confidence > 1', () => {
    expect(() =>
      PeerObservationSchema.parse({
        observerId: 'a1',
        targetId: 'a2',
        observation: 'x',
        confidence: 1.1,
        ts: 't1',
      }),
    ).toThrow()
  })
})
