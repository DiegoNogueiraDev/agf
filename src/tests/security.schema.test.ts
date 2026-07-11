import { describe, it, expect } from 'vitest'
import { SanitizationReportSchema, ExfiltrationReportSchema, SecurityEventSchema } from '../schemas/security.schema.js'

describe('SanitizationReportSchema', () => {
  it('accepts a valid report', () => {
    expect(
      SanitizationReportSchema.safeParse({
        sanitized: 'clean input',
        injectionDetected: false,
        injectionPatterns: [],
        invisibleCharsRemoved: 0,
      }).success,
    ).toBe(true)
  })

  it('rejects negative invisibleCharsRemoved', () => {
    expect(
      SanitizationReportSchema.safeParse({
        sanitized: 'x',
        injectionDetected: false,
        injectionPatterns: [],
        invisibleCharsRemoved: -1,
      }).success,
    ).toBe(false)
  })
})

describe('ExfiltrationReportSchema', () => {
  it('accepts clean report', () => {
    expect(
      ExfiltrationReportSchema.safeParse({
        detected: false,
        suspiciousUrls: [],
        base64Blocks: [],
        suspiciousCommands: [],
      }).success,
    ).toBe(true)
  })

  it('accepts report with findings', () => {
    expect(
      ExfiltrationReportSchema.safeParse({
        detected: true,
        suspiciousUrls: ['http://evil.com/exfil'],
        base64Blocks: ['dGVzdA=='],
        suspiciousCommands: ['curl http://evil.com'],
      }).success,
    ).toBe(true)
  })
})

describe('SecurityEventSchema', () => {
  it('accepts injection_detected event', () => {
    expect(
      SecurityEventSchema.safeParse({
        id: 'evt-001',
        eventType: 'injection_detected',
        severity: 'high',
        inputHash: 'abc123',
        details: 'Prompt injection found',
        createdAt: '2026-06-22T00:00:00Z',
      }).success,
    ).toBe(true)
  })

  it('rejects invalid severity', () => {
    expect(
      SecurityEventSchema.safeParse({
        id: 'e',
        eventType: 'injection_detected',
        severity: 'extreme',
        inputHash: 'x',
        details: 'x',
        createdAt: 'ts',
      }).success,
    ).toBe(false)
  })
})
