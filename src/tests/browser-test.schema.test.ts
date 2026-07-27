import { describe, it, expect } from 'vitest'
import { BrowserTestNodeSchema } from '../schemas/browser-test.schema.js'

const valid = {
  runId: 'run-001',
  targetUrl: 'https://example.com',
  featureNodeId: 'node-abc',
  status: 'pass' as const,
  evidences: [{ selector: '#btn', action: 'click' }],
  pathTaken: ['/home', '/dashboard'],
  startedAt: '2026-06-22T00:00:00Z',
  endedAt: '2026-06-22T00:01:00Z',
}

describe('BrowserTestNodeSchema', () => {
  it('accepts a valid browser test node', () => {
    expect(BrowserTestNodeSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts all valid statuses', () => {
    for (const status of ['running', 'pass', 'fail', 'broken']) {
      expect(BrowserTestNodeSchema.safeParse({ ...valid, status }).success).toBe(true)
    }
  })

  it('rejects invalid status', () => {
    expect(BrowserTestNodeSchema.safeParse({ ...valid, status: 'skipped' }).success).toBe(false)
  })

  it('rejects empty runId', () => {
    expect(BrowserTestNodeSchema.safeParse({ ...valid, runId: '' }).success).toBe(false)
  })

  it('rejects evidence with empty selector', () => {
    expect(
      BrowserTestNodeSchema.safeParse({
        ...valid,
        evidences: [{ selector: '', action: 'click' }],
      }).success,
    ).toBe(false)
  })

  it('accepts optional adrNodeId and unitTestPath', () => {
    const result = BrowserTestNodeSchema.safeParse({
      ...valid,
      adrNodeId: 'adr-001',
      unitTestPath: 'src/tests/foo.test.ts',
    })
    expect(result.success).toBe(true)
  })
})
