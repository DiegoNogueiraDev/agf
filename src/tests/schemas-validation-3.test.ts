/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { BrowserTestNodeSchema } from '../schemas/browser-test.schema.js'
import { deepMerge, resolveLayers, flattenLayers, type LayerSource } from '../schemas/config-layers.schema.js'
import { ContractSchema, ContractResultSchema } from '../schemas/contract-schema.js'
import { DelegationTaskSchema, DelegationResultSchema, DelegationEntrySchema } from '../schemas/delegation.schema.js'
import { DeployReadinessCheckSchema, DeployReadinessReportSchema } from '../schemas/deployer-schema.js'

// ── browser-test.schema ─────────────────────────────────────────────────────

describe('BrowserTestNodeSchema', () => {
  const valid = {
    runId: 'run-1',
    targetUrl: 'http://example.com',
    featureNodeId: 'epic-1',
    status: 'pass' as const,
    evidences: [{ selector: '#btn', action: 'click' }],
    pathTaken: ['step1'],
    startedAt: '2026-01-01T00:00:00Z',
    endedAt: '2026-01-01T00:01:00Z',
  }

  it('accepts valid node', () => {
    expect(BrowserTestNodeSchema.parse(valid).runId).toBe('run-1')
  })

  it('accepts optional fields', () => {
    const data = { ...valid, adrNodeId: 'adr-1', unitTestPath: 'tests/foo.test.ts' }
    expect(BrowserTestNodeSchema.parse(data).adrNodeId).toBe('adr-1')
  })

  it('rejects empty targetUrl', () => {
    expect(BrowserTestNodeSchema.safeParse({ ...valid, targetUrl: '' }).success).toBe(false)
  })

  it('rejects invalid status', () => {
    expect(BrowserTestNodeSchema.safeParse({ ...valid, status: 'unknown' }).success).toBe(false)
  })

  it('rejects null', () => {
    expect(BrowserTestNodeSchema.safeParse(null).success).toBe(false)
  })
})

// ── config-layers.schema (functions) ────────────────────────────────────────

describe('deepMerge', () => {
  it('merges two flat objects', () => {
    const result = deepMerge({ a: 1 }, { b: 2 })
    expect(result).toEqual({ a: 1, b: 2 })
  })

  it('last source wins for simple values', () => {
    const result = deepMerge({ a: 1 }, { a: 2 })
    expect(result.a).toBe(2)
  })

  it('deeply merges nested objects', () => {
    const result = deepMerge({ outer: { inner: 1 } }, { outer: { inner2: 2 } })
    expect(result).toEqual({ outer: { inner: 1, inner2: 2 } })
  })

  it('concatenates arrays', () => {
    const result = deepMerge({ items: [1] }, { items: [2] })
    expect(result.items).toEqual([1, 2])
  })

  it('handles empty sources', () => {
    const result = deepMerge({ a: 1 })
    expect(result.a).toBe(1)
  })
})

describe('resolveLayers', () => {
  it('merges layers in order (last wins)', () => {
    const layers: LayerSource[] = [
      { name: 'base', data: { a: 1, b: 1 } },
      { name: 'override', data: { b: 2, c: 3 } },
    ]
    const result = resolveLayers(layers)
    expect(result).toEqual({ a: 1, b: 2, c: 3 })
  })
})

describe('flattenLayers', () => {
  it('returns shallow copies', () => {
    const layers: LayerSource[] = [{ name: 'base', data: { x: 1 } }]
    const flat = flattenLayers(layers)
    expect(flat[0].data).toEqual({ x: 1 })
    expect(flat[0].data).not.toBe(layers[0].data)
  })
})

// ── contract-schema ─────────────────────────────────────────────────────────

describe('ContractResultSchema', () => {
  it('accepts valid result', () => {
    const data = { claim: 'does X', validated: true }
    expect(ContractResultSchema.parse(data).validated).toBe(true)
  })

  it('rejects empty claim', () => {
    expect(ContractResultSchema.safeParse({ claim: '', validated: true }).success).toBe(false)
  })

  it('rejects null', () => {
    expect(ContractResultSchema.safeParse(null).success).toBe(false)
  })
})

describe('ContractSchema', () => {
  const valid = {
    taskId: 'task-1',
    implementorClaims: ['does X'],
    validationCriteria: ['should Y'],
    results: [],
  }

  it('accepts valid contract', () => {
    expect(ContractSchema.parse(valid).taskId).toBe('task-1')
  })

  it('rejects empty implementorClaims', () => {
    expect(ContractSchema.safeParse({ ...valid, implementorClaims: [] }).success).toBe(false)
  })

  it('rejects empty validationCriteria', () => {
    expect(ContractSchema.safeParse({ ...valid, validationCriteria: [] }).success).toBe(false)
  })

  it('rejects null', () => {
    expect(ContractSchema.safeParse(null).success).toBe(false)
  })
})

// ── delegation.schema ───────────────────────────────────────────────────────

describe('DelegationTaskSchema', () => {
  it('accepts valid task', () => {
    const data = { objective: 'do stuff', allowedTools: ['read', 'write'] }
    const result = DelegationTaskSchema.parse(data)
    expect(result.objective).toBe('do stuff')
    expect(result.timeoutMs).toBe(300_000)
  })

  it('rejects empty objective', () => {
    expect(DelegationTaskSchema.safeParse({ objective: '', allowedTools: ['read'] }).success).toBe(false)
  })

  it('rejects empty allowedTools', () => {
    expect(DelegationTaskSchema.safeParse({ objective: 'x', allowedTools: [] }).success).toBe(false)
  })
})

describe('DelegationResultSchema', () => {
  it('accepts valid result', () => {
    const data = { delegationId: 'd1', status: 'completed' as const, summary: 'done' }
    expect(DelegationResultSchema.parse(data).status).toBe('completed')
  })

  it('defaults tokens and duration', () => {
    const result = DelegationResultSchema.parse({ delegationId: 'd1', status: 'failed' as const, summary: 'fail' })
    expect(result.tokensUsed).toBe(0)
    expect(result.durationMs).toBe(0)
  })

  it('rejects invalid status', () => {
    expect(DelegationResultSchema.safeParse({ delegationId: 'd1', status: 'unknown', summary: '' }).success).toBe(false)
  })
})

describe('DelegationEntrySchema', () => {
  const valid = {
    id: 'd1',
    parentAgentId: 'p1',
    childAgentId: 'c1',
    objective: 'do it',
    allowedTools: '["read"]',
    status: 'running' as const,
    resultSummary: null,
    depth: 1,
    createdAt: '2026-01-01T00:00:00Z',
    completedAt: null,
  }

  it('accepts valid entry', () => {
    expect(DelegationEntrySchema.parse(valid).id).toBe('d1')
  })

  it('rejects invalid status', () => {
    expect(DelegationEntrySchema.safeParse({ ...valid, status: 'invalid' }).success).toBe(false)
  })
})

// ── deployer-schema ─────────────────────────────────────────────────────────

describe('DeployReadinessCheckSchema', () => {
  it('accepts valid check', () => {
    const data = { name: 'tests pass', passed: true, details: 'all green', severity: 'required' as const }
    expect(DeployReadinessCheckSchema.parse(data).name).toBe('tests pass')
  })

  it('rejects invalid severity', () => {
    expect(
      DeployReadinessCheckSchema.safeParse({ name: 'x', passed: true, details: '', severity: 'optional' }).success,
    ).toBe(false)
  })
})

describe('DeployReadinessReportSchema', () => {
  it('accepts valid report', () => {
    const data = {
      checks: [],
      ready: true,
      score: 85,
      grade: 'B' as const,
      summary: 'ready to deploy',
    }
    expect(DeployReadinessReportSchema.parse(data).grade).toBe('B')
  })

  it('rejects score > 100', () => {
    expect(
      DeployReadinessReportSchema.safeParse({ checks: [], ready: true, score: 200, grade: 'A' as const, summary: '' })
        .success,
    ).toBe(false)
  })

  it('rejects invalid grade', () => {
    expect(
      DeployReadinessReportSchema.safeParse({ checks: [], ready: true, score: 50, grade: 'X' as const, summary: '' })
        .success,
    ).toBe(false)
  })
})
