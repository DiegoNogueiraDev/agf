import { describe, it, expect } from 'vitest'
import {
  APPROVAL_SLACK_TIMEOUT_MS,
  isApprovalSlackDisabled,
  buildSlackPayload,
  postApprovalToSlack,
} from '../core/hooks/approval-slack-bridge.js'
import type { ApprovalEvent } from '../core/hooks/approval-slack-bridge.js'

const event: ApprovalEvent = {
  tool: 'bash',
  severity: 'high',
  reason: 'dangerous command detected',
  matched: 'rm -rf',
}

describe('APPROVAL_SLACK_TIMEOUT_MS', () => {
  it('is a positive number', () => {
    expect(APPROVAL_SLACK_TIMEOUT_MS).toBeGreaterThan(0)
  })
})

describe('isApprovalSlackDisabled', () => {
  it('returns false by default', () => {
    expect(isApprovalSlackDisabled({})).toBe(false)
  })

  it('returns true when env var disables it', () => {
    expect(isApprovalSlackDisabled({ MCP_GRAPH_APPROVAL_SLACK: 'off' })).toBe(true)
  })
})

describe('buildSlackPayload', () => {
  it('includes tool and severity in payload fields', () => {
    const payload = buildSlackPayload(event)
    expect(payload.text).toContain('bash')
    const fields = payload.attachments[0]?.fields ?? []
    expect(fields.some((f) => f.title === 'Tool')).toBe(true)
    expect(fields.some((f) => f.title === 'Severity')).toBe(true)
  })

  it('includes matched pattern when provided', () => {
    const payload = buildSlackPayload(event)
    const fields = payload.attachments[0]?.fields ?? []
    expect(fields.some((f) => f.title === 'Matched')).toBe(true)
  })

  it('does not include matched when absent', () => {
    const e: ApprovalEvent = { tool: 'write', severity: 'low', reason: 'safe write' }
    const payload = buildSlackPayload(e)
    const fields = payload.attachments[0]?.fields ?? []
    expect(fields.some((f) => f.title === 'Matched')).toBe(false)
  })
})

describe('postApprovalToSlack', () => {
  it('returns disabled when env disables it', async () => {
    const result = await postApprovalToSlack(event, { env: { MCP_GRAPH_APPROVAL_SLACK: 'off' } })
    expect(result.posted).toBe(false)
    expect(result.reason).toBe('disabled')
  })

  it('returns no_webhook when SLACK_WEBHOOK_URL is not set', async () => {
    const result = await postApprovalToSlack(event, { env: {} })
    expect(result.posted).toBe(false)
    expect(result.reason).toBe('no_webhook')
  })

  it('returns failed when fetch throws', async () => {
    const fakeFetch = async () => {
      throw new Error('network error')
    }
    const result = await postApprovalToSlack(event, {
      env: { SLACK_WEBHOOK_URL: 'https://hooks.slack.com/test' },
      fetch: fakeFetch as any,
    })
    expect(result.posted).toBe(false)
    expect(result.reason).toBe('failed')
  })
})
