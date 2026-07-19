/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Schema validation tests — batch 10: pipeline.schema, plugin.schema,
 * policy-engine.schema, preset.schema, readiness-schema
 */

import { describe, it, expect } from 'vitest'
import { PipelineStepSchema, PipelineStepResultSchema, PipelineResultSchema } from '../schemas/pipeline.schema.js'
import { PluginCapabilitySchema, PluginManifestSchema } from '../schemas/plugin.schema.js'
import {
  PolicyEngine,
  type PolicyRule,
  type PolicyContext,
  type PolicyCondition,
} from '../schemas/policy-engine.schema.js'
import { PresetSchema, PresetLifecycleSchema, PresetDodSchema } from '../schemas/preset.schema.js'
import {
  BaseReadinessCheckSchema,
  BaseReadinessReportSchema,
  ReadinessSeveritySchema,
} from '../schemas/readiness-schema.js'

// ── pipeline.schema ──

describe('PipelineStepSchema', () => {
  it('should accept valid step', () => {
    const s = PipelineStepSchema.parse({ tool: 'list' })
    expect(s.tool).toBe('list')
  })

  it('should default args to {}', () => {
    const s = PipelineStepSchema.parse({ tool: 'list' })
    expect(s.args).toEqual({})
  })

  it('should accept args and extractField', () => {
    const s = PipelineStepSchema.parse({ tool: 'search', args: { query: 'test' }, extractField: 'results' })
    expect(s.extractField).toBe('results')
  })

  it('should reject empty tool', () => {
    expect(() => PipelineStepSchema.parse({ tool: '' })).toThrow()
  })
})

describe('PipelineStepResultSchema', () => {
  it('should accept success result', () => {
    const r = PipelineStepResultSchema.parse({
      stepIndex: 0,
      tool: 'list',
      status: 'success',
      durationMs: 10,
    })
    expect(r.status).toBe('success')
  })

  it('should accept error result', () => {
    const r = PipelineStepResultSchema.parse({
      stepIndex: 1,
      tool: 'write',
      status: 'error',
      error: 'permission denied',
      durationMs: 5,
    })
    expect(r.error).toBe('permission denied')
  })

  it('should accept skipped result', () => {
    const r = PipelineStepResultSchema.parse({
      stepIndex: 0,
      tool: 'skip',
      status: 'skipped',
      durationMs: 0,
    })
    expect(r.status).toBe('skipped')
  })

  it('should reject invalid status', () => {
    expect(() =>
      PipelineStepResultSchema.parse({
        stepIndex: 0,
        tool: 'x',
        status: 'unknown',
        durationMs: 0,
      }),
    ).toThrow()
  })
})

describe('PipelineResultSchema', () => {
  it('should accept valid result', () => {
    const r = PipelineResultSchema.parse({
      ok: true,
      stepsTotal: 2,
      stepsCompleted: 2,
      stepsFailed: 0,
      stepsSkipped: 0,
      steps: [],
      totalDurationMs: 100,
    })
    expect(r.ok).toBe(true)
  })

  it('should accept with steps', () => {
    const r = PipelineResultSchema.parse({
      ok: false,
      stepsTotal: 1,
      stepsCompleted: 0,
      stepsFailed: 1,
      stepsSkipped: 0,
      steps: [{ stepIndex: 0, tool: 'x', status: 'error', error: 'fail', durationMs: 0 }],
      totalDurationMs: 0,
    })
    expect(r.steps).toHaveLength(1)
  })

  it('should reject negative step counts', () => {
    expect(() =>
      PipelineResultSchema.parse({
        ok: true,
        stepsTotal: -1,
        stepsCompleted: 0,
        stepsFailed: 0,
        stepsSkipped: 0,
        steps: [],
        totalDurationMs: 0,
      }),
    ).toThrow()
  })
})

// ── plugin.schema ──

describe('PluginCapabilitySchema', () => {
  it('should accept valid capabilities', () => {
    expect(PluginCapabilitySchema.parse('analyzer')).toBe('analyzer')
    expect(PluginCapabilitySchema.parse('tool')).toBe('tool')
    expect(PluginCapabilitySchema.parse('event_handler')).toBe('event_handler')
  })

  it('should reject invalid capability', () => {
    expect(() => PluginCapabilitySchema.parse('runner')).toThrow()
  })
})

describe('PluginManifestSchema', () => {
  const validManifest = {
    name: 'my-plugin',
    version: '1.0.0',
    description: 'A test plugin',
    entryPoint: './dist/index.js',
    capabilities: ['tool'],
  }

  it('should accept valid manifest', () => {
    const m = PluginManifestSchema.parse(validManifest)
    expect(m.name).toBe('my-plugin')
  })

  it('should accept optional fields', () => {
    const m = PluginManifestSchema.parse({
      ...validManifest,
      author: 'me',
      repository: 'https://github.com/me/plugin',
      requires: { mcpGraphVersion: '1.0', plugins: ['other'] },
      conflicts: ['old-plugin'],
      config: { debug: true },
      lifecycleHooks: ['onLoad'],
    })
    expect(m.author).toBe('me')
    expect(m.requires?.plugins).toHaveLength(1)
  })

  it('should reject empty name', () => {
    expect(() => PluginManifestSchema.parse({ ...validManifest, name: '' })).toThrow()
  })

  it('should reject invalid semver', () => {
    expect(() => PluginManifestSchema.parse({ ...validManifest, version: 'abc' })).toThrow()
  })

  it('should reject non-url repository', () => {
    expect(() => PluginManifestSchema.parse({ ...validManifest, repository: 'not-a-url' })).toThrow()
  })
})

// ── policy-engine.schema (class-based, no Zod) ──

describe('PolicyEngine', () => {
  const engine = new PolicyEngine()

  it('should return matching actions for highest priority rule', () => {
    const rules: PolicyRule[] = [{ condition: { greenAt: 'ci/main' }, actions: ['deploy'], priority: 10 }]
    const actions = engine.evaluate(rules, { greenLevel: 'ci/main' })
    expect(actions).toEqual(['deploy'])
  })

  it('should respect priority ordering', () => {
    const rules: PolicyRule[] = [
      { condition: { greenAt: 'ci/main' }, actions: ['deploy'], priority: 5 },
      { condition: { greenAt: 'ci/main' }, actions: ['deploy-staging'], priority: 10 },
    ]
    const actions = engine.evaluate(rules, { greenLevel: 'ci/main' })
    expect(actions).toEqual(['deploy-staging'])
  })

  it('should return empty array when no rule matches', () => {
    const rules: PolicyRule[] = [{ condition: { greenAt: 'ci/main' }, actions: ['deploy'], priority: 1 }]
    const actions = engine.evaluate(rules, { greenLevel: 'ci/other' })
    expect(actions).toEqual([])
  })

  it('should evaluate all condition', () => {
    const rules: PolicyRule[] = [
      {
        condition: { all: [{ greenAt: 'ci/main' }, { reviewPassed: true }] },
        actions: ['deploy'],
        priority: 1,
      },
    ]
    expect(engine.evaluate(rules, { greenLevel: 'ci/main', reviewStatus: 'passed' })).toEqual(['deploy'])
    expect(engine.evaluate(rules, { greenLevel: 'ci/main', reviewStatus: 'failed' })).toEqual([])
  })

  it('should evaluate any condition', () => {
    const rules: PolicyRule[] = [
      {
        condition: { any: [{ greenAt: 'ci/main' }, { approvalTokenPresent: true }] },
        actions: ['deploy'],
        priority: 1,
      },
    ]
    expect(engine.evaluate(rules, { greenLevel: 'ci/main' })).toEqual(['deploy'])
    expect(engine.evaluate(rules, { hasApprovalToken: true })).toEqual(['deploy'])
    expect(engine.evaluate(rules, {})).toEqual([])
  })

  it('should evaluate not condition', () => {
    const rules: PolicyRule[] = [
      {
        condition: { not: { staleBranch: true } },
        actions: ['allow'],
        priority: 1,
      },
    ]
    expect(engine.evaluate(rules, { isStaleBranch: false })).toEqual(['allow'])
    expect(engine.evaluate(rules, { isStaleBranch: true })).toEqual([])
  })

  it('should evaluate nested conditions', () => {
    const rules: PolicyRule[] = [
      {
        condition: {
          all: [{ any: [{ greenAt: 'ci/main' }, { approvalTokenPresent: true }] }, { not: { staleBranch: true } }],
        },
        actions: ['deploy-prod'],
        priority: 1,
      },
    ]
    const ctx: PolicyContext = { greenLevel: 'ci/main', isStaleBranch: false }
    expect(engine.evaluate(rules, ctx)).toEqual(['deploy-prod'])
  })

  it('should return empty for empty rules', () => {
    expect(engine.evaluate([], {})).toEqual([])
  })
})

// ── preset.schema ──

describe('PresetLifecycleSchema', () => {
  it('should accept undefined/omitted', () => {
    expect(PresetLifecycleSchema.parse(undefined)).toBeUndefined()
  })

  it('should accept valid lifecycle config', () => {
    const l = PresetLifecycleSchema.parse({
      phases: ['ANALYZE', 'DESIGN'],
      strictness: 'advisory',
      codeIntelligence: 'off',
      prerequisites: 'advisory',
    })
    expect(l?.phases).toHaveLength(2)
  })
})

describe('PresetDodSchema', () => {
  it('should accept undefined/omitted', () => {
    expect(PresetDodSchema.parse(undefined)).toBeUndefined()
  })

  it('should accept valid dod config', () => {
    const d = PresetDodSchema.parse({
      checks: { has_tests: true },
      customChecks: [
        {
          name: 'security-scan',
          description: 'run security scan',
          phase: 'VALIDATE',
          condition: '$$status === \"done\"',
        },
      ],
    })
    expect(d?.customChecks).toHaveLength(1)
  })
})

describe('PresetSchema', () => {
  it('should accept valid preset', () => {
    const p = PresetSchema.parse({
      name: 'strict-tdd',
      description: 'Strict TDD workflow',
    })
    expect(p.name).toBe('strict-tdd')
  })

  it('should accept full preset', () => {
    const p = PresetSchema.parse({
      name: 'enterprise',
      description: 'Enterprise workflow',
      extends: 'strict-tdd',
      lifecycle: { phases: ['ANALYZE', 'DESIGN', 'PLAN', 'IMPLEMENT', 'VALIDATE'] },
      dod: { checks: { has_tests: true } },
      classifierPatterns: { epic: ['EPIC-*'] },
      templates: ['epic-template'],
      tags: ['enterprise', 'compliance'],
    })
    expect(p.extends).toBe('strict-tdd')
    expect(p.tags).toHaveLength(2)
  })

  it('should reject empty name', () => {
    expect(() => PresetSchema.parse({ name: '', description: 'd' })).toThrow()
  })
})

// ── readiness-schema ──

describe('ReadinessSeveritySchema', () => {
  it('should accept valid severities', () => {
    expect(ReadinessSeveritySchema.parse('required')).toBe('required')
    expect(ReadinessSeveritySchema.parse('recommended')).toBe('recommended')
  })

  it('should reject invalid severity', () => {
    expect(() => ReadinessSeveritySchema.parse('optional')).toThrow()
  })
})

describe('BaseReadinessCheckSchema', () => {
  it('should accept valid check', () => {
    const c = BaseReadinessCheckSchema.parse({
      name: 'test-coverage',
      passed: true,
      details: '80% covered',
      severity: 'required',
    })
    expect(c.passed).toBe(true)
  })

  it('should accept failed check', () => {
    const c = BaseReadinessCheckSchema.parse({
      name: 'lint',
      passed: false,
      details: '3 errors',
      severity: 'recommended',
    })
    expect(c.passed).toBe(false)
  })
})

describe('BaseReadinessReportSchema', () => {
  it('should accept valid report', () => {
    const r = BaseReadinessReportSchema.parse({
      checks: [],
      ready: true,
      score: 90,
      grade: 'A',
      summary: 'All checks pass',
    })
    expect(r.ready).toBe(true)
    expect(r.score).toBe(90)
  })

  it('should accept failing report', () => {
    const r = BaseReadinessReportSchema.parse({
      checks: [{ name: 'tests', passed: false, details: 'missing', severity: 'required' }],
      ready: false,
      score: 30,
      grade: 'D',
      summary: 'Needs work',
    })
    expect(r.ready).toBe(false)
  })

  it('should reject score < 0', () => {
    expect(() =>
      BaseReadinessReportSchema.parse({
        checks: [],
        ready: true,
        score: -1,
        grade: 'F',
        summary: '',
      }),
    ).toThrow()
  })

  it('should reject score > 100', () => {
    expect(() =>
      BaseReadinessReportSchema.parse({
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
      BaseReadinessReportSchema.parse({
        checks: [],
        ready: true,
        score: 50,
        grade: 'Z',
        summary: '',
      }),
    ).toThrow()
  })
})
