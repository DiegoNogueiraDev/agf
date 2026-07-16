/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  AdrValidationResultSchema,
  AdrReportSchema,
  TraceabilityEntrySchema,
  TraceabilityReportSchema,
  NodeCouplingMetricsSchema,
  CouplingReportSchema,
  InterfaceCheckResultSchema,
  InterfaceReportSchema,
  TechRiskEntrySchema,
  TechRiskReportSchema,
  DesignReadinessCheckSchema,
  DesignReadinessReportSchema,
} from '../schemas/designer-schema.js'
import { GraphEdgeSchema, RelationTypeSchema } from '../schemas/edge.schema.js'
import { EntitySchema, EntityRelationSchema, EntityMentionSchema } from '../schemas/entity.schema.js'
import { PromptSlotSchema, PromptFragmentSchema, ReviewDecision } from '../schemas/extension-lifecycle.schema.js'
import { FailureSignalSchema, FailureSignalContextSchema } from '../schemas/failure-signal.schema.js'

// ── designer-schema ─────────────────────────────────────────────────────────

describe('AdrValidationResultSchema', () => {
  const valid = {
    nodeId: 'adr-1',
    title: 'Use Postgres',
    grade: 'B' as const,
    hasStatus: true,
    hasContext: true,
    hasDecision: true,
    hasConsequences: false,
    missingFields: ['consequences'],
  }

  it('accepts valid result', () => {
    expect(AdrValidationResultSchema.parse(valid).nodeId).toBe('adr-1')
  })

  it('rejects invalid grade', () => {
    expect(AdrValidationResultSchema.safeParse({ ...valid, grade: 'X' }).success).toBe(false)
  })
})

describe('AdrReportSchema', () => {
  it('accepts valid report', () => {
    const data = { decisions: [], overallGrade: 'A' as const, summary: 'all good' }
    expect(AdrReportSchema.parse(data).overallGrade).toBe('A')
  })
})

describe('TraceabilityEntrySchema', () => {
  it('accepts valid entry', () => {
    const data = { requirementId: 'r1', linkedDecisions: [], linkedConstraints: [], coverage: 'full' as const }
    expect(TraceabilityEntrySchema.parse(data).coverage).toBe('full')
  })
})

describe('TraceabilityReportSchema', () => {
  it('accepts valid report', () => {
    const data = {
      matrix: [],
      coverageRate: 75,
      uncoveredRequirements: [],
      untracedRequirements: [],
      traceabilityWarning: 0,
      orphanDecisions: [],
    }
    expect(TraceabilityReportSchema.parse(data).coverageRate).toBe(75)
  })

  it('rejects out-of-range coverageRate', () => {
    expect(
      TraceabilityReportSchema.safeParse({
        matrix: [],
        coverageRate: 101,
        uncoveredRequirements: [],
        untracedRequirements: [],
        traceabilityWarning: 0,
        orphanDecisions: [],
      }).success,
    ).toBe(false)
  })
})

describe('NodeCouplingMetricsSchema', () => {
  it('accepts valid metrics', () => {
    const data = { nodeId: 'n1', fanIn: 2, fanOut: 1, depth: 0, instability: 0.5 }
    expect(NodeCouplingMetricsSchema.parse(data).instability).toBe(0.5)
  })

  it('rejects negative fanIn', () => {
    expect(
      NodeCouplingMetricsSchema.safeParse({ nodeId: 'n1', fanIn: -1, fanOut: 0, depth: 0, instability: 0 }).success,
    ).toBe(false)
  })

  it('rejects instability > 1', () => {
    expect(
      NodeCouplingMetricsSchema.safeParse({ nodeId: 'n1', fanIn: 0, fanOut: 0, depth: 0, instability: 1.5 }).success,
    ).toBe(false)
  })
})

describe('CouplingReportSchema', () => {
  it('accepts valid report', () => {
    const data = { nodes: [], highCouplingNodes: [], isolatedNodes: [], avgFanIn: 0, avgFanOut: 0, avgInstability: 0 }
    expect(CouplingReportSchema.parse(data).avgFanIn).toBe(0)
  })
})

describe('InterfaceCheckResultSchema', () => {
  it('accepts valid result', () => {
    const data = {
      nodeId: 'n1',
      hasDescription: true,
      hasAC: true,
      hasEdges: false,
      hasConstraintLink: false,
      score: 50,
    }
    expect(InterfaceCheckResultSchema.parse(data).score).toBe(50)
  })
})

describe('InterfaceReportSchema', () => {
  it('accepts valid report', () => {
    const data = { results: [], overallScore: 80, nodesWithoutContracts: [] }
    expect(InterfaceReportSchema.parse(data).overallScore).toBe(80)
  })
})

describe('TechRiskEntrySchema', () => {
  const valid = {
    nodeId: 'n1',
    category: 'security' as const,
    probability: 'high' as const,
    impact: 'medium' as const,
    score: 6,
    mitigated: false,
  }

  it('accepts valid entry', () => {
    expect(TechRiskEntrySchema.parse(valid).score).toBe(6)
  })

  it('rejects invalid category', () => {
    expect(TechRiskEntrySchema.safeParse({ ...valid, category: 'unknown' }).success).toBe(false)
  })
})

describe('TechRiskReportSchema', () => {
  it('accepts valid report', () => {
    const data = { risks: [], inferredRisks: [], riskScore: 0, highRisks: [] }
    expect(TechRiskReportSchema.parse(data).riskScore).toBe(0)
  })
})

describe('DesignReadinessCheckSchema', () => {
  it('accepts valid check', () => {
    const data = { name: 'ADR quality', passed: true, details: 'ok', severity: 'required' as const }
    expect(DesignReadinessCheckSchema.parse(data).passed).toBe(true)
  })
})

describe('DesignReadinessReportSchema', () => {
  it('accepts valid report', () => {
    const data = { checks: [], ready: true, score: 80, grade: 'B' as const, summary: 'ready' }
    expect(DesignReadinessReportSchema.parse(data).ready).toBe(true)
  })
})

// ── edge.schema ─────────────────────────────────────────────────────────────

describe('RelationTypeSchema', () => {
  it('accepts valid relation types', () => {
    expect(RelationTypeSchema.parse('depends_on')).toBe('depends_on')
    expect(RelationTypeSchema.parse('tests')).toBe('tests')
  })

  it('rejects unknown type', () => {
    expect(RelationTypeSchema.safeParse('unknown').success).toBe(false)
  })
})

describe('GraphEdgeSchema', () => {
  const valid = {
    id: 'e1',
    from: 'n1',
    to: 'n2',
    relationType: 'depends_on' as const,
    createdAt: '2026-01-01T00:00:00Z',
  }

  it('accepts valid edge', () => {
    expect(GraphEdgeSchema.parse(valid).id).toBe('e1')
  })

  it('accepts optional fields', () => {
    const data = { ...valid, weight: 0.5, reason: 'because', metadata: { key: 'val' } }
    const result = GraphEdgeSchema.parse(data)
    expect(result.weight).toBe(0.5)
    expect(result.metadata).toEqual({ key: 'val' })
  })

  it('rejects missing id', () => {
    const { id: _, ...rest } = valid
    expect(GraphEdgeSchema.safeParse(rest).success).toBe(false)
  })

  it('rejects null', () => {
    expect(GraphEdgeSchema.safeParse(null).success).toBe(false)
  })
})

// ── entity.schema ───────────────────────────────────────────────────────────

describe('EntitySchema', () => {
  const valid = {
    id: 'ent-1',
    name: 'User',
    type: 'concept' as const,
    normalizedName: 'user',
    aliases: [],
    description: 'a user entity',
    mentionCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }

  it('accepts valid entity', () => {
    expect(EntitySchema.parse(valid).name).toBe('User')
  })

  it('description can be null', () => {
    expect(EntitySchema.parse({ ...valid, description: null }).description).toBeNull()
  })

  it('rejects negative mentionCount', () => {
    expect(EntitySchema.safeParse({ ...valid, mentionCount: -1 }).success).toBe(false)
  })
})

describe('EntityRelationSchema', () => {
  const valid = {
    id: 'rel-1',
    fromEntityId: 'ent-1',
    toEntityId: 'ent-2',
    relationType: 'uses' as const,
    weight: 0.8,
    sourceDocId: null,
    createdAt: '2026-01-01T00:00:00Z',
  }

  it('accepts valid relation', () => {
    expect(EntityRelationSchema.parse(valid).relationType).toBe('uses')
  })

  it('rejects weight > 1', () => {
    expect(EntityRelationSchema.safeParse({ ...valid, weight: 1.5 }).success).toBe(false)
  })
})

describe('EntityMentionSchema', () => {
  const valid = {
    id: 'men-1',
    entityId: 'ent-1',
    docId: 'doc-1',
    context: null,
    position: 0,
    createdAt: '2026-01-01T00:00:00Z',
  }

  it('accepts valid mention', () => {
    expect(EntityMentionSchema.parse(valid).position).toBe(0)
  })

  it('rejects negative position', () => {
    expect(EntityMentionSchema.safeParse({ ...valid, position: -5 }).success).toBe(false)
  })
})

// ── extension-lifecycle.schema ──────────────────────────────────────────────

describe('PromptSlotSchema', () => {
  it('accepts all slots', () => {
    for (const s of ['DeveloperPolicy', 'DeveloperCapabilities', 'ContextualUser', 'SeparateDeveloper'] as const) {
      expect(PromptSlotSchema.parse(s)).toBe(s)
    }
  })

  it('rejects unknown', () => {
    expect(PromptSlotSchema.safeParse('UnknownSlot').success).toBe(false)
  })
})

describe('PromptFragmentSchema', () => {
  it('accepts valid fragment', () => {
    const data = { slot: 'DeveloperPolicy' as const, text: 'be safe', priority: 50 }
    expect(PromptFragmentSchema.parse(data).priority).toBe(50)
  })

  it('applies default priority', () => {
    const result = PromptFragmentSchema.parse({ slot: 'DeveloperPolicy' as const, text: 'hi' })
    expect(result.priority).toBe(50)
  })

  it('rejects priority out of range', () => {
    expect(PromptFragmentSchema.safeParse({ slot: 'DeveloperPolicy', text: 'x', priority: 200 }).success).toBe(false)
  })
})

describe('ReviewDecision', () => {
  it('has all expected values', () => {
    expect(ReviewDecision.Allow).toBe('allow')
    expect(ReviewDecision.Deny).toBe('deny')
    expect(ReviewDecision.AskUser).toBe('ask_user')
  })
})

// ── failure-signal.schema ───────────────────────────────────────────────────

describe('FailureSignalContextSchema', () => {
  it('accepts empty object', () => {
    expect(FailureSignalContextSchema.parse({})).toEqual({})
  })

  it('accepts all fields', () => {
    const data = { toolName: 'bash', phase: 'IMPLEMENT', nodeId: 'n1' }
    expect(FailureSignalContextSchema.parse(data).toolName).toBe('bash')
  })
})

describe('FailureSignalSchema', () => {
  const valid = {
    source: 'tool_invocation' as const,
    signalKind: 'timeout',
    context: {},
    severity: 'error' as const,
    timestamp: '2026-01-01T00:00:00Z',
  }

  it('accepts valid signal', () => {
    expect(FailureSignalSchema.parse(valid).signalKind).toBe('timeout')
  })

  it('rejects invalid source', () => {
    expect(FailureSignalSchema.safeParse({ ...valid, source: 'unknown' }).success).toBe(false)
  })

  it('rejects invalid severity', () => {
    expect(FailureSignalSchema.safeParse({ ...valid, severity: 'fatal' }).success).toBe(false)
  })

  it('rejects null', () => {
    expect(FailureSignalSchema.safeParse(null).success).toBe(false)
  })
})
