import { describe, it, expect } from 'vitest'
import { detectBannedPhrases } from '../../core/hooks/anti-hallucination-detector.js'
import { checkDestructiveDbIntent } from '../../core/hooks/destructive-db-guard.js'
import { isBudgetLow } from '../../core/hooks/agent-budget-precheck.js'
import { getApprovalTimeoutMs, ApprovalTimeoutTracker } from '../../core/hooks/approval-timeout.js'
import { getWipCap } from '../../core/hooks/wip-cap-guard.js'

describe('builtin: anti-hallucination', () => {
  it('blocks banned phrases', () => {
    const hits = detectBannedPhrases('this is standard practice in the industry')
    expect(hits).toContain('standard practice')
  })

  it('detects "typically" as banned', () => {
    expect(detectBannedPhrases('this typically works')).toContain('typically')
  })

  it('detects "obviously" as banned', () => {
    expect(detectBannedPhrases('obviously this is correct')).toContain('obviously')
  })

  it('detects "best practice" as banned', () => {
    expect(detectBannedPhrases('following best practice')).toContain('best practice')
  })

  it('detects "as expected" as banned', () => {
    expect(detectBannedPhrases('the result is as expected')).toContain('as expected')
  })

  it('returns empty for safe text', () => {
    expect(detectBannedPhrases('this is a specific implementation detail')).toEqual([])
  })

  it('returns empty for null/undefined input', () => {
    expect(detectBannedPhrases(null)).toEqual([])
    expect(detectBannedPhrases(undefined)).toEqual([])
  })

  it('does not false-positive on similar words', () => {
    expect(detectBannedPhrases('normalize the data')).not.toContain('normally')
    expect(detectBannedPhrases('standardize the output')).not.toContain('standard practice')
  })
})

describe('builtin: destructive-db-guard', () => {
  it('blocks rm graph.db pattern', () => {
    const result = checkDestructiveDbIntent('rm workflow-graph/graph.db')
    expect(result.blocked).toBe(true)
    expect(result.matchedPattern).toContain('rm graph.db')
  })

  it('blocks DROP TABLE on mcp-graph tables', () => {
    const result = checkDestructiveDbIntent('DROP TABLE IF EXISTS nodes')
    expect(result.blocked).toBe(true)
  })

  it('blocks DELETE FROM without WHERE', () => {
    const result = checkDestructiveDbIntent('DELETE FROM edges;')
    expect(result.blocked).toBe(true)
  })

  it('allows safe queries', () => {
    const result = checkDestructiveDbIntent('SELECT * FROM nodes WHERE id = ?')
    expect(result.blocked).toBe(false)
  })

  it('empty text returns safe', () => {
    expect(checkDestructiveDbIntent('').blocked).toBe(false)
  })

  it('confirmation phrase bypasses guard', () => {
    const result = checkDestructiveDbIntent('I want to reset the entire graph', 'CONFIRMO APAGAR mcp-graph')
    expect(result.blocked).toBe(false)
  })
})

describe('builtin: wip-cap-guard', () => {
  it('getWipCap returns default cap of 1', () => {
    expect(getWipCap({})).toBe(1)
  })

  it('getWipCap reads from env', () => {
    expect(getWipCap({ MCP_GRAPH_WIP_CAP: '3' })).toBe(3)
  })

  it('getWipCap rejects invalid values', () => {
    expect(getWipCap({ MCP_GRAPH_WIP_CAP: 'abc' })).toBe(1)
    expect(getWipCap({ MCP_GRAPH_WIP_CAP: '0' })).toBe(1)
    expect(getWipCap({ MCP_GRAPH_WIP_CAP: '-1' })).toBe(1)
  })
})

describe('builtin: agent-budget-precheck', () => {
  it('returns true when budget exceeds 90% threshold', () => {
    expect(isBudgetLow({ currentUsd: 9.1, capUsd: 10 })).toBe(true)
  })

  it('returns false when budget is below threshold', () => {
    expect(isBudgetLow({ currentUsd: 5, capUsd: 10 })).toBe(false)
  })

  it('returns false when cap is undefined', () => {
    expect(isBudgetLow({ currentUsd: 100, capUsd: undefined })).toBe(false)
  })

  it('returns false when cap is zero', () => {
    expect(isBudgetLow({ currentUsd: 100, capUsd: 0 })).toBe(false)
  })
})

describe('builtin: approval-timeout', () => {
  it('getApprovalTimeoutMs returns default of 5 min', () => {
    expect(getApprovalTimeoutMs({})).toBe(300_000)
  })

  it('getApprovalTimeoutMs reads from env', () => {
    expect(getApprovalTimeoutMs({ MCP_GRAPH_APPROVAL_TIMEOUT_MS: '10000' })).toBe(10_000)
  })

  it('getApprovalTimeoutMs rejects invalid values', () => {
    expect(getApprovalTimeoutMs({ MCP_GRAPH_APPROVAL_TIMEOUT_MS: 'abc' })).toBe(300_000)
  })

  it('tracker fires callback on timeout', async () => {
    const callback = vi.fn()
    const tracker = new ApprovalTimeoutTracker(50, callback)
    tracker.arm('approval-1', { taskId: 't1' })

    await new Promise((r) => setTimeout(r, 100))
    expect(callback).toHaveBeenCalledWith('approval-1', { taskId: 't1' })
    tracker.clear()
  })

  it('tracker resolve cancels timer', async () => {
    const callback = vi.fn()
    const tracker = new ApprovalTimeoutTracker(50, callback)
    tracker.arm('approval-1', {})
    tracker.resolve('approval-1')

    await new Promise((r) => setTimeout(r, 100))
    expect(callback).not.toHaveBeenCalled()
    tracker.clear()
  })

  it('pending returns count of armed timers', () => {
    const tracker = new ApprovalTimeoutTracker(100, () => {})
    tracker.arm('a', {})
    tracker.arm('b', {})
    expect(tracker.pending).toBe(2)
    tracker.resolve('a')
    expect(tracker.pending).toBe(1)
    tracker.clear()
    expect(tracker.pending).toBe(0)
  })
})
