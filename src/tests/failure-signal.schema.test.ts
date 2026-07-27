import { describe, it, expect } from 'vitest'
import { FailureSignalSchema, FailureSignalContextSchema } from '../schemas/failure-signal.schema.js'

describe('FailureSignalContextSchema', () => {
  it('accepts empty context', () => {
    expect(FailureSignalContextSchema.safeParse({}).success).toBe(true)
  })

  it('accepts full context', () => {
    expect(
      FailureSignalContextSchema.safeParse({
        toolName: 'bash',
        phase: 'IMPLEMENT',
        nodeId: 'node-123',
      }).success,
    ).toBe(true)
  })
})

describe('FailureSignalSchema', () => {
  it('accepts a valid signal', () => {
    const result = FailureSignalSchema.safeParse({
      source: 'tool_invocation',
      signalKind: 'timeout',
      context: {},
      severity: 'error',
      timestamp: '2026-06-22T00:00:00Z',
    })
    expect(result.success).toBe(true)
  })

  it('accepts all valid sources', () => {
    for (const source of ['tool_invocation', 'lifecycle_gate', 'dod_check', 'mcp_server', 'sqlite']) {
      expect(
        FailureSignalSchema.safeParse({
          source,
          signalKind: 'test',
          context: {},
          severity: 'warn',
          timestamp: 'ts',
        }).success,
      ).toBe(true)
    }
  })

  it('rejects invalid source', () => {
    expect(
      FailureSignalSchema.safeParse({
        source: 'network',
        signalKind: 'x',
        context: {},
        severity: 'warn',
        timestamp: 'ts',
      }).success,
    ).toBe(false)
  })

  it('accepts optional rawError', () => {
    expect(
      FailureSignalSchema.safeParse({
        source: 'sqlite',
        signalKind: 'constraint',
        context: {},
        severity: 'critical',
        timestamp: 'ts',
        rawError: 'UNIQUE constraint failed',
      }).success,
    ).toBe(true)
  })
})
