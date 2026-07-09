import { describe, it, expect } from 'vitest'
import {
  HelperOriginSchema,
  HelperRecordSchema,
  HarnessSessionStatusSchema,
  HarnessAuditActionSchema,
} from '../schemas/browser-harness.schema.js'

describe('HelperOriginSchema', () => {
  it('accepts builtin and agent', () => {
    expect(HelperOriginSchema.safeParse('builtin').success).toBe(true)
    expect(HelperOriginSchema.safeParse('agent').success).toBe(true)
  })

  it('rejects unknown origin', () => {
    expect(HelperOriginSchema.safeParse('system').success).toBe(false)
  })
})

describe('HelperRecordSchema', () => {
  it('accepts a valid helper record', () => {
    const result = HelperRecordSchema.safeParse({
      name: 'click_button',
      version: 1,
      source: 'async function click_button(sel) { await page.click(sel); }',
      signature: {
        params: [{ name: 'sel', type: 'string' }],
        returns: 'Promise<void>',
      },
      origin: 'builtin',
      createdAt: 1_000_000,
      createdBy: 'system',
    })
    expect(result.success).toBe(true)
  })

  it('rejects non-snake_case name', () => {
    expect(
      HelperRecordSchema.safeParse({
        name: 'ClickButton',
        version: 1,
        source: 'fn',
        signature: { params: [], returns: 'void' },
        origin: 'builtin',
        createdAt: 0,
      }).success,
    ).toBe(false)
  })
})

describe('HarnessSessionStatusSchema', () => {
  it('accepts all session statuses', () => {
    for (const s of ['starting', 'ready', 'closed', 'error']) {
      expect(HarnessSessionStatusSchema.safeParse(s).success).toBe(true)
    }
  })
})

describe('HarnessAuditActionSchema', () => {
  it('accepts all audit actions', () => {
    for (const a of ['start', 'stop', 'call', 'add_helper', 'cdp_raw', 'safety_block']) {
      expect(HarnessAuditActionSchema.safeParse(a).success).toBe(true)
    }
  })
})
