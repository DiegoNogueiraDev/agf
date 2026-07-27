/*!
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest'
import { z } from 'zod/v4'
import {
  LifecyclePhaseEnum,
  SkillPreferenceSchema,
  SkillTriggerSchema,
  CustomSkillInputSchema,
  CustomSkillSchema,
  TemplateSubtaskSchema,
  TaskTemplateInputSchema,
  TaskTemplateSchema,
} from '../schemas/skill.schema.js'
import {
  SpecTemplateSchema,
  SpecTemplateSectionSchema,
  SpecTemplateVariableSchema,
} from '../schemas/spec-template.schema.js'
import { ToolHookConfigSchema, HookResultSchema, ToolHookEventSchema } from '../schemas/tool-hook.schema.js'
import {
  DoneIntegrityReportSchema,
  StatusFlowReportSchema,
  ValidationReadinessReportSchema,
  ValidationReadinessCheckSchema,
  DoneIntegrityIssueSchema,
  StatusFlowViolationSchema,
  EdgeConsistencyReportSchema,
} from '../schemas/validator-schema.js'
import {
  Wave125W2HAnalysisSchema,
  Why5W2HSchema,
  What5W2HSchema,
  Who5W2HSchema,
  When5W2HSchema,
  Where5W2HSchema,
  How5W2HSchema,
  HowMuch5W2HSchema,
  StakeholderSchema,
  PhaseSchema,
  EnvironmentSchema,
  ArchitectureTierSchema,
} from '../schemas/wave-12-5w2h-analysis.js'

// ─── skill.schema.ts ─────────────────────────────────────────────────────

describe('LifecyclePhaseEnum', () => {
  it('accepts valid phases', () => {
    expect(LifecyclePhaseEnum.parse('ANALYZE')).toBe('ANALYZE')
    expect(LifecyclePhaseEnum.parse('LISTENING')).toBe('LISTENING')
  })
  it('rejects invalid phase', () => {
    expect(() => LifecyclePhaseEnum.parse('UNKNOWN')).toThrow(z.ZodError)
  })
})

describe('SkillPreferenceSchema', () => {
  it('parses valid preference', () => {
    const data = { projectId: 'p1', skillName: 'graph-heal', enabled: true, updatedAt: '2026-01-01' }
    expect(SkillPreferenceSchema.parse(data)).toEqual(data)
  })
})

describe('SkillTriggerSchema', () => {
  it('parses valid trigger', () => {
    const data = { event: 'on_validate_start' }
    expect(SkillTriggerSchema.parse(data)).toEqual(data)
  })
  it('accepts optional condition', () => {
    const data = { event: 'on_validate_start', condition: 'score < 70' }
    expect(SkillTriggerSchema.parse(data)).toEqual(data)
  })
})

describe('CustomSkillInputSchema', () => {
  const valid = {
    name: 'test-skill',
    description: 'A test skill for validation',
    phases: ['IMPLEMENT'],
    instructions: 'Do the thing',
  }
  it('parses valid input', () => {
    const parsed = CustomSkillInputSchema.parse(valid)
    expect(parsed.name).toBe('test-skill')
    expect(parsed.category).toBe('know-me')
  })
  it('rejects empty name', () => {
    expect(() => CustomSkillInputSchema.parse({ ...valid, name: '' })).toThrow(z.ZodError)
  })
  it('accepts optional platforms', () => {
    const data = { ...valid, platforms: ['darwin', 'linux'] }
    expect(CustomSkillInputSchema.parse(data).platforms).toHaveLength(2)
  })
  it('rejects too many platforms', () => {
    expect(() =>
      CustomSkillInputSchema.parse({ ...valid, platforms: ['darwin', 'linux', 'win32', 'freebsd'] }),
    ).toThrow(z.ZodError)
  })
})

describe('CustomSkillSchema', () => {
  it('parses valid full skill', () => {
    const data = {
      id: 's1',
      projectId: 'p1',
      name: 'test',
      description: 'desc',
      phases: ['ANALYZE'],
      instructions: 'instr',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02',
    }
    expect(CustomSkillSchema.parse(data)).toMatchObject({ name: 'test' })
  })
})

describe('TemplateSubtaskSchema', () => {
  it('parses minimal subtask', () => {
    const data = { title: 'Implement X' }
    const parsed = TemplateSubtaskSchema.parse(data)
    expect(parsed.type).toBe('subtask')
  })
})

describe('TaskTemplateInputSchema', () => {
  it('parses valid input', () => {
    const data = {
      name: 'Template 1',
      description: 'A task template',
      subtasks: [{ title: 'Step 1' }],
    }
    expect(TaskTemplateInputSchema.parse(data)).toMatchObject({ name: 'Template 1' })
  })
  it('rejects empty subtasks', () => {
    expect(() => TaskTemplateInputSchema.parse({ name: 'T', description: 'd', subtasks: [] })).toThrow(z.ZodError)
  })
})

describe('TaskTemplateSchema', () => {
  it('parses valid template', () => {
    const data = {
      id: 't1',
      projectId: 'p1',
      name: 'Template 1',
      description: 'desc',
      subtasks: [{ title: 'Step 1' }],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02',
    }
    expect(TaskTemplateSchema.parse(data)).toMatchObject({ name: 'Template 1' })
  })
})

// ─── spec-template.schema.ts ─────────────────────────────────────────────

describe('SpecTemplateVariableSchema', () => {
  it('parses valid variable', () => {
    const data = { description: 'A variable', type: 'string', required: true }
    expect(SpecTemplateVariableSchema.parse(data)).toMatchObject({ required: true })
  })
  it('defaults required to false', () => {
    const parsed = SpecTemplateVariableSchema.parse({ description: 'var', type: 'number' })
    expect(parsed.required).toBe(false)
  })
  it('rejects invalid type', () => {
    expect(() => SpecTemplateVariableSchema.parse({ description: 'v', type: 'array' })).toThrow(z.ZodError)
  })
})

describe('SpecTemplateSectionSchema', () => {
  it('parses valid section', () => {
    const data = { title: 'Context', description: 'Project context', required: true }
    expect(SpecTemplateSectionSchema.parse(data)).toMatchObject({ title: 'Context' })
  })
  it('defaults required to true', () => {
    const parsed = SpecTemplateSectionSchema.parse({ title: 'T', description: 'd' })
    expect(parsed.required).toBe(true)
  })
})

describe('SpecTemplateSchema', () => {
  it('parses valid template', () => {
    const data = {
      name: 'analyze-prd',
      phase: 'ANALYZE',
      description: 'PRD template',
      sections: [{ title: 'Problem', description: 'What problem', required: true }],
    }
    expect(SpecTemplateSchema.parse(data)).toMatchObject({ name: 'analyze-prd' })
  })
  it('defaults constitution to false', () => {
    const parsed = SpecTemplateSchema.parse({
      name: 't',
      phase: 'DESIGN',
      description: 'd',
      sections: [],
    })
    expect(parsed.constitution).toBe(false)
  })
  it('rejects invalid phase', () => {
    expect(() => SpecTemplateSchema.parse({ name: 't', phase: 'DEPLOY', description: 'd', sections: [] })).toThrow(
      z.ZodError,
    )
  })
})

// ─── tool-hook.schema.ts ───────────────────────────────────────────────

describe('ToolHookEventSchema', () => {
  it('accepts valid events', () => {
    expect(ToolHookEventSchema.parse('PreToolUse')).toBe('PreToolUse')
    expect(ToolHookEventSchema.parse('PostToolUse')).toBe('PostToolUse')
    expect(ToolHookEventSchema.parse('PostToolUseFailure')).toBe('PostToolUseFailure')
  })
  it('rejects invalid event', () => {
    expect(() => ToolHookEventSchema.parse('OnError')).toThrow(z.ZodError)
  })
})

describe('ToolHookConfigSchema', () => {
  it('parses valid config', () => {
    const data = { tool: 'read', event: 'PreToolUse', command: 'echo ok' }
    const parsed = ToolHookConfigSchema.parse(data)
    expect(parsed.timeoutMs).toBe(5000)
  })
  it('accepts custom timeout', () => {
    const data = { tool: '*', event: 'PostToolUse', command: 'validate', timeoutMs: 10000 }
    expect(ToolHookConfigSchema.parse(data).timeoutMs).toBe(10000)
  })
  it('rejects non-positive timeout', () => {
    expect(() => ToolHookConfigSchema.parse({ tool: 'r', event: 'PreToolUse', command: 'c', timeoutMs: -1 })).toThrow(
      z.ZodError,
    )
  })
})

describe('HookResultSchema', () => {
  it('parses deny result', () => {
    const data = { allow: false }
    expect(HookResultSchema.parse(data)).toEqual(data)
  })
  it('parses allow with warnings', () => {
    const data = { allow: true, updatedInput: { arg: 'val' }, warnings: ['slow'] }
    expect(HookResultSchema.parse(data)).toMatchObject({ allow: true })
  })
})

// ─── validator-schema.ts ──────────────────────────────────────────────

describe('DoneIntegrityIssueSchema', () => {
  it('parses valid issue', () => {
    const data = { nodeId: 'n1', title: 'Task 1', issueType: 'blocked_but_done', details: 'Blocked but marked done' }
    expect(DoneIntegrityIssueSchema.parse(data)).toEqual(data)
  })
})

describe('DoneIntegrityReportSchema', () => {
  it('parses valid report', () => {
    const data = { issues: [], passed: true }
    expect(DoneIntegrityReportSchema.parse(data)).toEqual(data)
  })
})

describe('StatusFlowViolationSchema', () => {
  it('parses valid violation', () => {
    const data = { nodeId: 'n2', title: 'Task 2', currentStatus: 'done', details: 'Skipped in_progress' }
    expect(StatusFlowViolationSchema.parse(data)).toEqual(data)
  })
})

describe('StatusFlowReportSchema', () => {
  it('parses valid report', () => {
    const data = { violations: [], complianceRate: 100 }
    expect(StatusFlowReportSchema.parse(data)).toEqual(data)
  })
  it('rejects compliance over 100', () => {
    expect(() => StatusFlowReportSchema.parse({ violations: [], complianceRate: 150 })).toThrow(z.ZodError)
  })
})

describe('ValidationReadinessCheckSchema', () => {
  it('parses valid check', () => {
    const data = { name: 'tests_pass', passed: true, details: 'All green', severity: 'required' }
    expect(ValidationReadinessCheckSchema.parse(data)).toEqual(data)
  })
})

describe('ValidationReadinessReportSchema', () => {
  const valid = {
    checks: [{ name: 'c1', passed: true, details: 'ok', severity: 'required' }],
    ready: true,
    score: 90,
    grade: 'A',
    summary: 'Ready',
  }
  it('parses valid report', () => {
    expect(ValidationReadinessReportSchema.parse(valid)).toMatchObject({ ready: true })
  })
})

describe('EdgeConsistencyReportSchema', () => {
  it('parses valid report', () => {
    const data = { issues: [], passed: true }
    expect(EdgeConsistencyReportSchema.parse(data)).toEqual(data)
  })
})

// ─── wave-12-5w2h-analysis.ts ──────────────────────────────────────────

describe('StakeholderSchema', () => {
  it('parses valid stakeholder', () => {
    const data = { role: 'Developer', responsibilities: ['Write code'] }
    expect(StakeholderSchema.parse(data)).toEqual(data)
  })
})

describe('PhaseSchema', () => {
  it('parses valid phase', () => {
    const data = { phase_name: 'IMPLEMENT', duration_weeks: 4 }
    expect(PhaseSchema.parse(data)).toEqual(data)
  })
  it('rejects invalid phase_name', () => {
    expect(() => PhaseSchema.parse({ phase_name: 'INVALID', duration_weeks: 1 })).toThrow(z.ZodError)
  })
})

describe('EnvironmentSchema', () => {
  it('parses valid environment', () => {
    const data = { name: 'local', purpose: 'Development' }
    expect(EnvironmentSchema.parse(data)).toEqual(data)
  })
})

describe('ArchitectureTierSchema', () => {
  it('parses valid tier', () => {
    const data = { name: 'Frontend', responsibility: 'UI', technology_stack: ['React'] }
    expect(ArchitectureTierSchema.parse(data)).toEqual(data)
  })
})

describe('Why5W2HSchema', () => {
  it('parses valid why', () => {
    const data = { rationale: 'Need faster local builds', benefits: ['Speed', 'Reliability'] }
    expect(Why5W2HSchema.parse(data)).toMatchObject({ benefits: ['Speed', 'Reliability'] })
  })
  it('rejects short rationale', () => {
    expect(() => Why5W2HSchema.parse({ rationale: 'Short', benefits: ['B1'] })).toThrow(z.ZodError)
  })
  it('rejects empty benefits', () => {
    expect(() => Why5W2HSchema.parse({ rationale: 'Long enough rationale text', benefits: [] })).toThrow(z.ZodError)
  })
})

describe('What5W2HSchema', () => {
  it('parses valid what', () => {
    const data = { artifact: 'Sandbox CLI tool', deliverables: ['Binary', 'Docs'], scope: 'cli-tool' }
    expect(What5W2HSchema.parse(data)).toEqual(data)
  })
})

describe('Who5W2HSchema', () => {
  it('parses valid who', () => {
    const data = { primary_stakeholders: [{ role: 'Dev', responsibilities: ['Code'] }] }
    expect(Who5W2HSchema.parse(data)).toMatchObject({})
  })
})

describe('When5W2HSchema', () => {
  it('parses valid when', () => {
    const data = {
      timeline_phases: [{ phase_name: 'IMPLEMENT', duration_weeks: 4 }],
      total_duration_weeks: 12,
      critical_milestone: 'Beta release',
    }
    expect(When5W2HSchema.parse(data)).toMatchObject({ total_duration_weeks: 12 })
  })
})

describe('Where5W2HSchema', () => {
  it('parses valid where', () => {
    const data = { execution_environments: [{ name: 'local', purpose: 'dev' }], primary_environment: 'local' }
    expect(Where5W2HSchema.parse(data)).toEqual(data)
  })
})

describe('How5W2HSchema', () => {
  it('parses valid how', () => {
    const data = {
      approach: 'Docker-based isolation',
      architecture_tiers: [{ name: 'Runtime', responsibility: 'exec', technology_stack: ['Docker'] }],
      key_mechanisms: ['Volume mounting'],
    }
    expect(How5W2HSchema.parse(data)).toMatchObject({ approach: 'Docker-based isolation' })
  })
})

describe('HowMuch5W2HSchema', () => {
  const valid = {
    cost_summary: { development_effort_person_weeks: 20, maintenance_effort_percent: 15 },
    team_size: { developers: 3, qa_engineers: 1, devops_infra: 1 },
    resource_requirements: { compute_hours_per_week: 40, storage_gb: 50, concurrent_executions: 5 },
    incremental_phases: [{ phase: 'Phase 1', effort_weeks: 8, scope: 'MVP' }],
  }
  it('parses valid how_much', () => {
    expect(HowMuch5W2HSchema.parse(valid)).toMatchObject({})
  })
  it('rejects negative team sizes', () => {
    expect(() =>
      HowMuch5W2HSchema.parse({ ...valid, team_size: { developers: -1, qa_engineers: 0, devops_infra: 0 } }),
    ).toThrow(z.ZodError)
  })
  it('rejects maintenance > 100', () => {
    expect(() =>
      HowMuch5W2HSchema.parse({
        ...valid,
        cost_summary: { development_effort_person_weeks: 10, maintenance_effort_percent: 150 },
      }),
    ).toThrow(z.ZodError)
  })
})

describe('Wave125W2HAnalysisSchema', () => {
  const valid = {
    initiative_id: 'SB-001',
    initiative_name: 'Sandbox Build',
    created_at: '2026-06-06T12:00:00Z',
    last_updated: '2026-06-06T12:00:00Z',
    why: { rationale: 'Need faster local builds to reduce cycle time', benefits: ['Speed', 'Reliability'] },
    what: { artifact: 'Sandbox CLI', deliverables: ['Binary'], scope: 'cli-tool' },
    who: { primary_stakeholders: [{ role: 'Developer', responsibilities: ['Code'] }] },
    when: {
      timeline_phases: [{ phase_name: 'IMPLEMENT', duration_weeks: 4 }],
      total_duration_weeks: 12,
      critical_milestone: 'Release',
    },
    where: { execution_environments: [{ name: 'local', purpose: 'dev' }], primary_environment: 'local' },
    how: {
      approach: 'Docker isolation',
      architecture_tiers: [{ name: 'R', responsibility: 'exec', technology_stack: ['D'] }],
      key_mechanisms: ['M1'],
    },
    how_much: {
      cost_summary: { development_effort_person_weeks: 20, maintenance_effort_percent: 10 },
      team_size: { developers: 2, qa_engineers: 1, devops_infra: 0 },
      resource_requirements: { compute_hours_per_week: 40, storage_gb: 50, concurrent_executions: 3 },
      incremental_phases: [],
    },
  }
  it('parses complete analysis', () => {
    expect(Wave125W2HAnalysisSchema.parse(valid)).toMatchObject({ initiative_id: 'SB-001' })
  })
  it('rejects short initiative_id', () => {
    expect(() => Wave125W2HAnalysisSchema.parse({ ...valid, initiative_id: 'AB' })).toThrow(z.ZodError)
  })
  it('rejects invalid datetime', () => {
    expect(() => Wave125W2HAnalysisSchema.parse({ ...valid, created_at: 'not-a-date' })).toThrow(z.ZodError)
  })
})
