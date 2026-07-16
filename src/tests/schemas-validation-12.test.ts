/*!
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest'
import { z } from 'zod/v4'
import {
  StackTypeSchema,
  IsolationModeSchema,
  ExecutionProfileSchema,
  TestFormatSchema,
  SandboxBuildInputSchema,
  BuildResultSchema,
  ReportIntegrationInputSchema,
  TestSummarySchema,
  FailedTestEntrySchema,
  TestParseResultSchema,
  ReportIntegrationResultSchema,
  EnvRequirementsSchema,
  EnvCheckResultSchema,
  VersionDivergenceSchema,
  SandboxConfigValidationSchema,
  ValidationIssueSchema,
  ValidationResultSchema as SandboxValidationResultSchema,
} from '../schemas/sandbox.schema.js'
import {
  SanitizationReportSchema,
  ExfiltrationReportSchema,
  ToolArgsSanitizationResultSchema,
  SecurityEventSchema,
} from '../schemas/security.schema.js'
import {
  SentruxScanResultSchema,
  SentruxSessionStartResultSchema,
  SentruxSessionEndResultSchema,
  SentruxViolationSchema,
  SentruxCheckRulesResultSchema,
  SentruxHealthResultSchema,
  SentruxRescanResultSchema,
  SentruxEvolutionResultSchema,
  SentruxDsmResultSchema,
  SentruxTestGapsResultSchema,
} from '../schemas/sentrux.schema.js'
import {
  CompactionConfigSchema,
  CompactionResultSchema,
  SessionForkSchema,
} from '../schemas/session-compaction.schema.js'
import {
  SiebelObjectTypeSchema,
  SiebelEnvironmentTypeSchema,
  SiebelEnvironmentSchema,
  SiebelObjectRefSchema,
  SiebelDependencySchema,
  SiebelPropertySchema,
  SiebelObjectSchema,
  SiebelSifMetadataSchema,
  SiebelSifParseResultSchema,
  SiebelComposerResultSchema,
  SiebelImpactResultSchema,
  SifGenerationRequestSchema,
  SifValidationResultSchema,
  SifGenerationResultSchema,
} from '../schemas/siebel.schema.js'

// ─── sandbox.schema.ts ─────────────────────────────────────────────────

describe('StackTypeSchema', () => {
  it('accepts valid stacks', () => {
    for (const s of ['maven', 'gradle', 'npm', 'go', 'pip', 'auto'] as const) {
      expect(StackTypeSchema.parse(s)).toBe(s)
    }
  })
  it('rejects invalid stack', () => {
    expect(() => StackTypeSchema.parse('rust')).toThrow(z.ZodError)
  })
})

describe('IsolationModeSchema', () => {
  it('accepts valid modes', () => {
    for (const m of ['docker', 'podman', 'process', 'auto'] as const) {
      expect(IsolationModeSchema.parse(m)).toBe(m)
    }
  })
})

describe('ExecutionProfileSchema', () => {
  it('accepts valid profiles', () => {
    for (const p of ['ci-mirror', 'fast', 'full'] as const) {
      expect(ExecutionProfileSchema.parse(p)).toBe(p)
    }
  })
})

describe('TestFormatSchema', () => {
  it('accepts valid formats', () => {
    for (const f of ['surefire', 'jest', 'junit', 'go-test', 'auto'] as const) {
      expect(TestFormatSchema.parse(f)).toBe(f)
    }
  })
})

describe('SandboxBuildInputSchema', () => {
  const valid = { projectDir: '/tmp/project' }
  it('parses with defaults', () => {
    const parsed = SandboxBuildInputSchema.parse(valid)
    expect(parsed.stack).toBe('auto')
    expect(parsed.isolation).toBe('auto')
    expect(parsed.profile).toBe('fast')
    expect(parsed.timeout).toBe(300000)
    expect(parsed.parallel).toBe(false)
  })
  it('rejects missing projectDir', () => {
    expect(() => SandboxBuildInputSchema.parse({})).toThrow(z.ZodError)
  })
  it('rejects timeout < 1000', () => {
    expect(() => SandboxBuildInputSchema.parse({ ...valid, timeout: 500 })).toThrow(z.ZodError)
  })
})

describe('BuildResultSchema', () => {
  const valid = {
    success: true,
    status: 'success',
    executionMode: 'docker',
    profile: 'fast',
    command: 'npm test',
    stack: 'npm',
    durationMs: 5000,
    output: 'All tests passed',
    timestamp: '2026-06-06T12:00:00Z',
    isolatedDir: '/tmp/sandbox/abc',
    cacheKey: 'abc123',
    cacheHit: false,
  }
  it('parses a valid build result', () => {
    expect(BuildResultSchema.parse(valid)).toMatchObject({ success: true })
  })
  it('rejects invalid timestamp', () => {
    expect(() => BuildResultSchema.parse({ ...valid, timestamp: 'not-a-date' })).toThrow(z.ZodError)
  })
})

describe('TestSummarySchema', () => {
  it('parses valid summary', () => {
    const data = { totalTests: 10, passedTests: 8, failedTests: 1, skippedTests: 1 }
    expect(TestSummarySchema.parse(data)).toEqual(data)
  })
  it('rejects negative counts', () => {
    expect(() => TestSummarySchema.parse({ totalTests: -1, passedTests: 0, failedTests: 0, skippedTests: 0 })).toThrow(
      z.ZodError,
    )
  })
})

describe('FailedTestEntrySchema', () => {
  it('parses valid failure entry', () => {
    const data = { name: 'FooTest', testMethod: 'testBar', message: 'Assertion failed' }
    expect(FailedTestEntrySchema.parse(data)).toEqual(data)
  })
})

describe('ReportIntegrationInputSchema', () => {
  it('parses with defaults', () => {
    const parsed = ReportIntegrationInputSchema.parse({ testOutput: 'PASS' })
    expect(parsed.testFormat).toBe('auto')
    expect(parsed.updateGraph).toBe(false)
  })
})

describe('EnvCheckResultSchema', () => {
  const valid = {
    success: true,
    missingEnvVars: [],
    divergences: [],
    recommendations: ['Install Node 18'],
    timestamp: '2026-06-06T12:00:00Z',
    summary: { passed: true, issues: 0 },
  }
  it('parses valid env check', () => {
    expect(EnvCheckResultSchema.parse(valid)).toMatchObject({ success: true })
  })
})

describe('SandboxConfigValidationSchema', () => {
  it('parses with validateStrictly default false', () => {
    const parsed = SandboxConfigValidationSchema.parse({ config: { projectDir: '/tmp/p' } })
    expect(parsed.validateStrictly).toBe(false)
  })
})

describe('ValidationIssueSchema', () => {
  it('parses valid issue', () => {
    const data = { level: 'error', field: 'projectDir', message: 'Not found' }
    expect(ValidationIssueSchema.parse(data)).toEqual(data)
  })
})

// ─── security.schema.ts ───────────────────────────────────────────────

describe('SanitizationReportSchema', () => {
  it('parses valid report', () => {
    const data = { sanitized: 'safe text', injectionDetected: false, injectionPatterns: [], invisibleCharsRemoved: 0 }
    expect(SanitizationReportSchema.parse(data)).toEqual(data)
  })
  it('rejects negative invisibleCharsRemoved', () => {
    expect(() =>
      SanitizationReportSchema.parse({
        sanitized: '',
        injectionDetected: false,
        injectionPatterns: [],
        invisibleCharsRemoved: -1,
      }),
    ).toThrow(z.ZodError)
  })
})

describe('ExfiltrationReportSchema', () => {
  it('parses valid report', () => {
    const data = { detected: false, suspiciousUrls: [], base64Blocks: [], suspiciousCommands: [] }
    expect(ExfiltrationReportSchema.parse(data)).toEqual(data)
  })
})

describe('ToolArgsSanitizationResultSchema', () => {
  it('parses valid result', () => {
    const data = { sanitized: { cmd: 'ls' }, injectionDetected: false, invisibleCharsRemoved: 0 }
    expect(ToolArgsSanitizationResultSchema.parse(data)).toEqual(data)
  })
})

describe('SecurityEventSchema', () => {
  it('parses valid event', () => {
    const data = {
      id: 'evt-1',
      eventType: 'injection_detected',
      severity: 'high',
      inputHash: 'hash123',
      details: 'SQL injection attempt',
      createdAt: '2026-06-06T12:00:00Z',
    }
    expect(SecurityEventSchema.parse(data)).toEqual(data)
  })
  it('rejects invalid eventType', () => {
    expect(() =>
      SecurityEventSchema.parse({
        id: 'e1',
        eventType: 'unknown',
        severity: 'low',
        inputHash: 'h',
        details: 'x',
        createdAt: '2026-01-01T00:00:00Z',
      }),
    ).toThrow(z.ZodError)
  })
  it('rejects invalid severity', () => {
    expect(() =>
      SecurityEventSchema.parse({
        id: 'e1',
        eventType: 'injection_detected',
        severity: 'extreme',
        inputHash: 'h',
        details: 'x',
        createdAt: '2026-01-01T00:00:00Z',
      }),
    ).toThrow(z.ZodError)
  })
})

// ─── sentrux.schema.ts ────────────────────────────────────────────────

describe('SentruxScanResultSchema', () => {
  it('parses valid scan result', () => {
    const data = { runId: 'r1', issuesFound: 5, severity: 'warn', timestamp: '2026-01-01T00:00:00Z' }
    expect(SentruxScanResultSchema.parse(data)).toEqual(data)
  })
  it('rejects negative issuesFound', () => {
    expect(() =>
      SentruxScanResultSchema.parse({
        runId: 'r1',
        issuesFound: -1,
        severity: 'ok',
        timestamp: '2026-01-01T00:00:00Z',
      }),
    ).toThrow(z.ZodError)
  })
})

describe('SentruxSessionStartResultSchema', () => {
  it('parses valid start result', () => {
    const data = { sessionId: 's1', startedAt: '2026-01-01T00:00:00Z' }
    expect(SentruxSessionStartResultSchema.parse(data)).toEqual(data)
  })
})

describe('SentruxSessionEndResultSchema', () => {
  it('parses valid end result', () => {
    const data = { sessionId: 's1', endedAt: '2026-01-01T00:00:00Z', delta: { score: -5 }, issuesDelta: 2 }
    expect(SentruxSessionEndResultSchema.parse(data)).toEqual(data)
  })
})

describe('SentruxViolationSchema', () => {
  it('parses valid violation', () => {
    const data = { path: 'src/foo.ts', rule: 'no-any', severity: 'error' }
    expect(SentruxViolationSchema.parse(data)).toEqual(data)
  })
})

describe('SentruxCheckRulesResultSchema', () => {
  it('parses valid result', () => {
    const data = { violations: [{ path: 'f.ts', rule: 'r1', severity: 'warn' }], totalCount: 1 }
    expect(SentruxCheckRulesResultSchema.parse(data)).toEqual(data)
  })
})

describe('SentruxHealthResultSchema', () => {
  it('parses valid health result', () => {
    const data = { status: 'healthy', checks: [{ name: 'db', status: 'ok' }], latency_ms: 150 }
    expect(SentruxHealthResultSchema.parse(data)).toEqual(data)
  })
  it('rejects invalid status', () => {
    expect(() => SentruxHealthResultSchema.parse({ status: 'unknown', checks: [], latency_ms: 0 })).toThrow(z.ZodError)
  })
})

describe('SentruxRescanResultSchema', () => {
  it('parses valid rescan result', () => {
    const data = { runId: 'r2', issuesDelta: -3, newIssues: [] }
    expect(SentruxRescanResultSchema.parse(data)).toEqual(data)
  })
})

describe('SentruxEvolutionResultSchema', () => {
  it('parses valid evolution result', () => {
    const data = {
      snapshots: [{ timestamp: '2026-01-01T00:00:00Z', score: 85, issueCount: 10 }],
      trend: 'improving',
      recommendation: 'Continue current practices',
    }
    expect(SentruxEvolutionResultSchema.parse(data)).toEqual(data)
  })
})

describe('SentruxDsmResultSchema', () => {
  it('parses valid DSM result', () => {
    const data = {
      matrix: [
        [1, 0],
        [0, 1],
      ],
      hotspots: ['core.ts'],
      coupling_score: 0.5,
    }
    expect(SentruxDsmResultSchema.parse(data)).toEqual(data)
  })
})

describe('SentruxTestGapsResultSchema', () => {
  it('parses valid test gaps result', () => {
    const data = {
      gaps: [{ file: 'f.ts', reason: 'no tests', priority: 'high' }],
      coverage_estimate: 0.6,
      priority_files: ['f.ts'],
    }
    expect(SentruxTestGapsResultSchema.parse(data)).toEqual(data)
  })
  it('rejects coverage > 1', () => {
    expect(() => SentruxTestGapsResultSchema.parse({ gaps: [], coverage_estimate: 1.5, priority_files: [] })).toThrow(
      z.ZodError,
    )
  })
})

// ─── session-compaction.schema.ts ────────────────────────────────────────

describe('CompactionConfigSchema', () => {
  it('parses with defaults', () => {
    const parsed = CompactionConfigSchema.parse({})
    expect(parsed.preserveRecentMessages).toBe(4)
    expect(parsed.maxEstimatedTokens).toBe(10000)
  })
  it('rejects non-positive values', () => {
    expect(() => CompactionConfigSchema.parse({ preserveRecentMessages: 0 })).toThrow(z.ZodError)
    expect(() => CompactionConfigSchema.parse({ maxEstimatedTokens: -1 })).toThrow(z.ZodError)
  })
})

describe('CompactionResultSchema', () => {
  const valid = {
    originalMessageCount: 20,
    preservedMessageCount: 5,
    removedMessageCount: 15,
    estimatedTokensSaved: 5000,
    compactedMessages: [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ],
    summarizedContent: 'Summary',
  }
  it('parses valid result', () => {
    expect(CompactionResultSchema.parse(valid)).toMatchObject({ originalMessageCount: 20 })
  })
  it('accepts optional contentType', () => {
    const data = {
      ...valid,
      compactedMessages: [{ role: 'system', content: 'sys', contentType: 'text' }],
    }
    expect(CompactionResultSchema.parse(data)).toMatchObject({})
  })
  it('rejects invalid role', () => {
    expect(() =>
      CompactionResultSchema.parse({ ...valid, compactedMessages: [{ role: 'admin', content: 'x' }] }),
    ).toThrow(z.ZodError)
  })
})

describe('SessionForkSchema', () => {
  it('parses valid fork', () => {
    const data = { id: 'f1', parentSessionId: 's1', branchName: 'feature-x', createdAt: '2026-01-01T00:00:00Z' }
    expect(SessionForkSchema.parse(data)).toEqual(data)
  })
})

// ─── siebel.schema.ts ──────────────────────────────────────────────────

describe('SiebelObjectTypeSchema', () => {
  it('accepts valid object types', () => {
    for (const t of ['applet', 'business_component', 'view', 'workflow', 'table'] as const) {
      expect(SiebelObjectTypeSchema.parse(t)).toBe(t)
    }
  })
  it('rejects invalid type', () => {
    expect(() => SiebelObjectTypeSchema.parse('widget')).toThrow(z.ZodError)
  })
})

describe('SiebelEnvironmentTypeSchema', () => {
  it('accepts valid env types', () => {
    for (const e of ['dev', 'test', 'staging', 'prod'] as const) {
      expect(SiebelEnvironmentTypeSchema.parse(e)).toBe(e)
    }
  })
})

describe('SiebelEnvironmentSchema', () => {
  const valid = { name: 'dev-env', url: 'https://siebel.example.com', version: '15.0', type: 'dev' }
  it('parses valid environment', () => {
    expect(SiebelEnvironmentSchema.parse(valid)).toEqual(valid)
  })
  it('rejects invalid URL', () => {
    expect(() => SiebelEnvironmentSchema.parse({ ...valid, url: 'not-a-url' })).toThrow(z.ZodError)
  })
})

describe('SiebelObjectRefSchema', () => {
  it('parses valid ref', () => {
    const data = { name: 'Account', type: 'business_component' }
    expect(SiebelObjectRefSchema.parse(data)).toEqual(data)
  })
})

describe('SiebelDependencySchema', () => {
  it('parses valid dependency', () => {
    const data = {
      from: { name: 'A', type: 'applet' },
      to: { name: 'B', type: 'business_component' },
      relationType: 'uses',
    }
    expect(SiebelDependencySchema.parse(data)).toEqual(data)
  })
})

describe('SiebelPropertySchema', () => {
  it('parses valid property', () => {
    const data = { name: 'DisplayName', value: 'Account List' }
    expect(SiebelPropertySchema.parse(data)).toEqual(data)
  })
})

describe('SiebelObjectSchema', () => {
  it('parses a simple object with no children', () => {
    const data = { name: 'Account', type: 'business_component', properties: [], children: [] }
    expect(SiebelObjectSchema.parse(data)).toMatchObject({ name: 'Account' })
  })
  it('parses a nested object', () => {
    const data = {
      name: 'Parent',
      type: 'business_component',
      properties: [],
      children: [{ name: 'Child', type: 'field', properties: [], children: [] }],
    }
    expect(SiebelObjectSchema.parse(data).children).toHaveLength(1)
  })
  it('rejects missing children', () => {
    expect(() => SiebelObjectSchema.parse({ name: 'X', type: 'applet', properties: [] })).toThrow(z.ZodError)
  })
})

describe('SiebelSifMetadataSchema', () => {
  it('parses valid metadata', () => {
    const data = {
      fileName: 'Account.sif',
      objectCount: 5,
      objectTypes: ['applet'],
      extractedAt: '2026-01-01T00:00:00Z',
    }
    expect(SiebelSifMetadataSchema.parse(data)).toMatchObject({ fileName: 'Account.sif' })
  })
})

describe('SiebelSifParseResultSchema', () => {
  it('parses valid parse result', () => {
    const data = {
      metadata: { fileName: 'test.sif', objectCount: 1, objectTypes: ['applet'], extractedAt: '2026-01-01T00:00:00Z' },
      objects: [{ name: 'O', type: 'applet', properties: [], children: [] }],
      dependencies: [],
    }
    expect(SiebelSifParseResultSchema.parse(data)).toMatchObject({})
  })
})

describe('SiebelComposerResultSchema', () => {
  it('parses valid composer result', () => {
    const data = { action: 'navigate', success: true, timestamp: '2026-01-01T00:00:00Z' }
    expect(SiebelComposerResultSchema.parse(data)).toEqual(data)
  })
})

describe('SiebelImpactResultSchema', () => {
  it('parses valid impact result', () => {
    const data = {
      targetObject: { name: 'Account', type: 'business_component' },
      directDependents: [],
      transitiveDependents: [],
      totalAffected: 0,
      riskLevel: 'low',
    }
    expect(SiebelImpactResultSchema.parse(data)).toMatchObject({ riskLevel: 'low' })
  })
})

describe('SifGenerationRequestSchema', () => {
  it('parses valid request', () => {
    const data = { description: 'Generate account BC', objectTypes: ['business_component'] }
    expect(SifGenerationRequestSchema.parse(data)).toEqual(data)
  })
})

describe('SifValidationResultSchema', () => {
  it('parses valid validation', () => {
    const data = { status: 'valid', messages: [], score: 100 }
    expect(SifValidationResultSchema.parse(data)).toEqual(data)
  })
  it('rejects score > 100', () => {
    expect(() => SifValidationResultSchema.parse({ status: 'valid', messages: [], score: 150 })).toThrow(z.ZodError)
  })
})

describe('SifGenerationResultSchema', () => {
  it('parses valid generation result', () => {
    const data = {
      sifContent: '<sif>...</sif>',
      objects: [{ name: 'Account', type: 'business_component' }],
      validation: { status: 'valid', messages: [], score: 95 },
      metadata: { generatedAt: '2026-01-01T00:00:00Z', requestDescription: 'Gen', objectCount: 1 },
    }
    expect(SifGenerationResultSchema.parse(data)).toMatchObject({})
  })
})
