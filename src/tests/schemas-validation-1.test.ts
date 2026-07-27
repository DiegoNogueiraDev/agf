/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  AcFormatSchema,
  GwtStepSchema,
  ParsedAcSchema,
  AcNodeReportSchema,
  AcQualityReportSchema,
  InvestCheckSchema,
  type ParsedAc,
  type GwtStep,
} from '../schemas/ac-quality-schema.js'
import { AgentRoleRegistry } from '../schemas/agent-registry.schema.js'
import {
  AgentRoleSchema,
  type AgentRole,
  AgentRoleConfigSchema,
  BUILT_IN_ROLES,
  getRoleConfig,
} from '../schemas/agent-role.schema.js'
import { AgentDefinitionSchema } from '../schemas/agent.schema.js'
import {
  PrdQualitySectionSchema,
  PrdQualityReportSchema,
  SectionQualitySchema,
  OrphanNodeSchema,
  CoverageMatrixSchema,
  ScopeAnalysisSchema,
  RiskEntrySchema,
  RiskMatrixSchema,
  ReadinessReportSchema,
} from '../schemas/analyzer-schema.js'

// ── ac-quality-schema ────────────────────────────────────────────────────────

describe('AcFormatSchema', () => {
  it('accepts valid formats', () => {
    expect(AcFormatSchema.parse('gwt')).toBe('gwt')
    expect(AcFormatSchema.parse('free_text')).toBe('free_text')
    expect(AcFormatSchema.parse('checklist')).toBe('checklist')
  })

  it('rejects invalid format', () => {
    expect(AcFormatSchema.safeParse('invalid').success).toBe(false)
  })
})

describe('GwtStepSchema', () => {
  const valid: GwtStep = { keyword: 'Given', text: 'user is logged in' }

  it('accepts a valid step', () => {
    expect(GwtStepSchema.parse(valid)).toEqual(valid)
  })

  it('rejects missing keyword', () => {
    expect(GwtStepSchema.safeParse({ text: 'foo' }).success).toBe(false)
  })

  it('rejects null', () => {
    expect(GwtStepSchema.safeParse(null).success).toBe(false)
  })
})

describe('ParsedAcSchema', () => {
  const valid: ParsedAc = {
    raw: 'Given user is logged in',
    format: 'gwt',
    isTestable: true,
    isMeasurable: true,
  }

  it('accepts complete object', () => {
    expect(ParsedAcSchema.parse(valid)).toEqual(valid)
  })

  it('accepts optional steps', () => {
    const withSteps: ParsedAc = { ...valid, steps: [{ keyword: 'When', text: 'click' }] }
    const result = ParsedAcSchema.parse(withSteps)
    expect(result.steps).toHaveLength(1)
  })

  it('rejects missing raw', () => {
    const { raw: _, ...rest } = valid
    expect(ParsedAcSchema.safeParse(rest).success).toBe(false)
  })
})

describe('InvestCheckSchema', () => {
  it('accepts valid check', () => {
    expect(InvestCheckSchema.parse({ criterion: 'I', passed: true, details: 'ok' })).toBeTruthy()
  })

  it('rejects missing details', () => {
    expect(InvestCheckSchema.safeParse({ criterion: 'I', passed: true }).success).toBe(false)
  })
})

describe('AcNodeReportSchema', () => {
  it('accepts valid report', () => {
    const data = {
      nodeId: 'n1',
      title: 'Task',
      score: 75,
      parsedAcs: [{ raw: 'test', format: 'gwt' as const, isTestable: true, isMeasurable: true }],
      investChecks: [{ criterion: 'I', passed: true, details: '' }],
      vagueTerms: ['soon'],
    }
    expect(AcNodeReportSchema.parse(data).score).toBe(75)
  })

  it('rejects score > 100', () => {
    const data = {
      nodeId: 'n1',
      title: 'T',
      score: 150,
      parsedAcs: [],
      investChecks: [],
      vagueTerms: [],
    }
    expect(AcNodeReportSchema.safeParse(data).success).toBe(false)
  })
})

describe('AcQualityReportSchema', () => {
  it('accepts valid report', () => {
    const data = {
      nodes: [],
      overallScore: 0,
      summary: '',
    }
    expect(AcQualityReportSchema.parse(data).overallScore).toBe(0)
  })
})

// ── agent-registry.schema (class) ────────────────────────────────────────────

describe('AgentRoleRegistry', () => {
  it('reserves a token for a known role', () => {
    const registry = new AgentRoleRegistry()
    const token = registry.reserve('awaiter')
    expect(token.agentId).toBeTruthy()
    expect(token.roleName).toBe('awaiter')
    expect(typeof token.issuedAt).toBe('number')
  })

  it('throws on unknown role', () => {
    const registry = new AgentRoleRegistry()
    expect(() => registry.reserve('unknown')).toThrow()
  })

  it('spawns an agent from token', () => {
    const registry = new AgentRoleRegistry()
    const token = registry.reserve('awaiter')
    const record = registry.spawn('parent-1', 'awaiter', token)
    expect(record.status).toBe('running')
    expect(record.parentId).toBe('parent-1')
  })

  it('spawns without token', () => {
    const registry = new AgentRoleRegistry()
    const record = registry.spawn('parent-1', 'explorer')
    expect(record.status).toBe('running')
  })

  it('kills a running agent', () => {
    const registry = new AgentRoleRegistry()
    const record = registry.spawn('p1', 'awaiter')
    registry.kill(record.agentId)
    const agent = registry.get(record.agentId)
    expect(agent!.status).toBe('stopped')
    expect(agent!.stoppedAt).toBeTruthy()
  })

  it('list returns only running agents', () => {
    const registry = new AgentRoleRegistry()
    const r1 = registry.spawn('p1', 'awaiter')
    const r2 = registry.spawn('p1', 'explorer')
    registry.kill(r1.agentId)
    expect(registry.list()).toHaveLength(1)
    expect(registry.listAll()).toHaveLength(2)
  })

  it('enforces spawn limits', () => {
    const registry = new AgentRoleRegistry({ maxSpawns: 1, roleLimits: {} })
    registry.spawn('p1', 'awaiter')
    expect(() => registry.spawn('p1', 'awaiter')).toThrow(/limit/)
  })
})

// ── agent-role.schema ───────────────────────────────────────────────────────

describe('AgentRoleSchema', () => {
  const minimal: AgentRole = { model: 'haiku', tools: ['read'], permissions: 'read-only' }

  it('accepts minimal role', () => {
    expect(AgentRoleSchema.parse(minimal).model).toBe('haiku')
  })

  it('applies defaults', () => {
    const result = AgentRoleSchema.parse(minimal)
    expect(result.maxRetries).toBe(2)
    expect(result.timeoutMs).toBe(120_000)
    expect(result.reasoning).toBe(false)
  })

  it('rejects empty tools', () => {
    expect(AgentRoleSchema.safeParse({ ...minimal, tools: [] }).success).toBe(false)
  })

  it('rejects invalid permissions', () => {
    expect(AgentRoleSchema.safeParse({ ...minimal, permissions: 'god' }).success).toBe(false)
  })

  it('rejects empty model', () => {
    expect(AgentRoleSchema.safeParse({ ...minimal, model: '' }).success).toBe(false)
  })

  it('rejects null', () => {
    expect(AgentRoleSchema.safeParse(null).success).toBe(false)
  })
})

describe('AgentRoleConfigSchema', () => {
  it('accepts valid config with one role', () => {
    const data = { agent: { custom: { model: 'sonnet', tools: ['read'], permissions: 'workspace-write' as const } } }
    expect(AgentRoleConfigSchema.parse(data).agent.custom.model).toBe('sonnet')
  })

  it('rejects empty agent map', () => {
    expect(AgentRoleConfigSchema.safeParse({ agent: {} }).success).toBe(false)
  })
})

describe('getRoleConfig', () => {
  it('returns built-in role when no config given', () => {
    expect(getRoleConfig('awaiter').model).toBe('haiku')
  })

  it('returns custom role when configured', () => {
    const cfg = { agent: { custom: { model: 'sonnet', tools: ['read'], permissions: 'workspace-write' as const } } }
    expect(getRoleConfig('custom', cfg).model).toBe('sonnet')
  })

  it('throws on unknown role', () => {
    expect(() => getRoleConfig('nope')).toThrow()
  })
})

// ── agent.schema ────────────────────────────────────────────────────────────

describe('AgentDefinitionSchema', () => {
  const valid = {
    name: 'helper',
    description: 'does stuff',
    tools: ['read', 'write'],
    systemPrompt: 'You are a helper.',
    phase: 'IMPLEMENT' as const,
  }

  it('accepts valid definition', () => {
    expect(AgentDefinitionSchema.parse(valid).name).toBe('helper')
  })

  it('accepts optional model', () => {
    expect(AgentDefinitionSchema.parse({ ...valid, model: 'sonnet' }).model).toBe('sonnet')
  })

  it('rejects empty name', () => {
    expect(AgentDefinitionSchema.safeParse({ ...valid, name: '' }).success).toBe(false)
  })

  it('rejects invalid phase', () => {
    expect(AgentDefinitionSchema.safeParse({ ...valid, phase: 'NOPE' }).success).toBe(false)
  })

  it('rejects null', () => {
    expect(AgentDefinitionSchema.safeParse(null).success).toBe(false)
  })
})

// ── analyzer-schema ─────────────────────────────────────────────────────────

describe('SectionQualitySchema', () => {
  it('accepts valid values', () => {
    expect(SectionQualitySchema.parse('strong')).toBe('strong')
    expect(SectionQualitySchema.parse('weak')).toBe('weak')
  })

  it('rejects unknown', () => {
    expect(SectionQualitySchema.safeParse('unknown').success).toBe(false)
  })
})

describe('PrdQualitySectionSchema', () => {
  it('accepts valid section', () => {
    const data = { name: 'overview', quality: 'adequate' as const, issues: [], suggestions: [] }
    expect(PrdQualitySectionSchema.parse(data).name).toBe('overview')
  })
})

describe('PrdQualityReportSchema', () => {
  it('accepts valid report', () => {
    const data = { score: 85, grade: 'B' as const, sections: [], readyForDesign: true, summary: 'Good' }
    expect(PrdQualityReportSchema.parse(data).grade).toBe('B')
  })
})

describe('OrphanNodeSchema', () => {
  it('accepts valid orphan', () => {
    expect(OrphanNodeSchema.parse({ id: 'o1', title: 'orphan', type: 'task', reason: 'no parent' }).id).toBe('o1')
  })
})

describe('CoverageMatrixSchema', () => {
  it('accepts valid coverage', () => {
    const data = {
      requirementsToTasks: 75,
      tasksToAc: 50,
      orphanRequirementsCount: 0,
      orphanTasks: 1,
      traceabilityWarning: 0,
    }
    expect(CoverageMatrixSchema.parse(data).requirementsToTasks).toBe(75)
  })

  it('rejects out-of-range value', () => {
    expect(
      CoverageMatrixSchema.safeParse({
        requirementsToTasks: 101,
        tasksToAc: 0,
        orphanRequirementsCount: 0,
        orphanTasks: 0,
        traceabilityWarning: 0,
      }).success,
    ).toBe(false)
  })
})

describe('ScopeAnalysisSchema', () => {
  it('accepts valid analysis', () => {
    const data = {
      orphans: [],
      cycles: [],
      coverage: {
        requirementsToTasks: 100,
        tasksToAc: 100,
        orphanRequirementsCount: 0,
        orphanTasks: 0,
        traceabilityWarning: 0,
      },
      conflicts: [],
      summary: 'ok',
      orphanRequirementsCount: 0,
    }
    expect(ScopeAnalysisSchema.parse(data).summary).toBe('ok')
  })
})

describe('RiskEntrySchema', () => {
  it('accepts valid risk', () => {
    const data = {
      nodeId: 'r1',
      title: 'Late delivery',
      probability: 3,
      impact: 4,
      score: 12,
      level: 'high' as const,
      mitigationStatus: 'partial' as const,
    }
    expect(RiskEntrySchema.parse(data).nodeId).toBe('r1')
  })

  it('rejects probability out of range', () => {
    const data = {
      nodeId: 'r1',
      title: 'Risk',
      probability: 0,
      impact: 4,
      score: 0,
      level: 'low' as const,
      mitigationStatus: 'unmitigated' as const,
    }
    expect(RiskEntrySchema.safeParse(data).success).toBe(false)
  })
})

describe('RiskMatrixSchema', () => {
  it('accepts valid matrix', () => {
    const data = { risks: [], summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, mitigated: 0 } }
    expect(RiskMatrixSchema.parse(data).summary.total).toBe(0)
  })
})

describe('ReadinessReportSchema', () => {
  it('accepts valid report', () => {
    const data = { readyForNextPhase: true, checks: [], blockers: [], warnings: [], summary: 'ok' }
    expect(ReadinessReportSchema.parse(data).summary).toBe('ok')
  })
})
