import { describe, it, expect } from 'vitest'
import {
  SESSION_GAP_THRESHOLD_MS,
  RESUME_NODES_LIMIT,
  RESUME_COMMITS_LIMIT,
  isSessionResumeDisabled,
  computeResumeDelta,
} from '../core/hooks/session-resume-detector.js'
import type { NodeRef, CommitRef } from '../core/hooks/session-resume-detector.js'

const now = 1_700_000_000_000

function makeNode(id: string): NodeRef {
  return { id, title: `Node ${id}`, updatedAt: now - 1000 }
}

function makeCommit(hash: string): CommitRef {
  return { hash, message: `commit ${hash}`, author: 'test', timestamp: now - 2000 }
}

describe('constants', () => {
  it('SESSION_GAP_THRESHOLD_MS is positive', () => {
    expect(SESSION_GAP_THRESHOLD_MS).toBeGreaterThan(0)
  })

  it('RESUME_NODES_LIMIT and RESUME_COMMITS_LIMIT are positive', () => {
    expect(RESUME_NODES_LIMIT).toBeGreaterThan(0)
    expect(RESUME_COMMITS_LIMIT).toBeGreaterThan(0)
  })
})

describe('isSessionResumeDisabled', () => {
  it('returns false by default', () => {
    expect(isSessionResumeDisabled({})).toBe(false)
  })

  it('returns true when env var is off', () => {
    expect(isSessionResumeDisabled({ MCP_GRAPH_SESSION_RESUME: 'off' })).toBe(true)
  })
})

describe('computeResumeDelta', () => {
  it('returns no_prior_session when lastSessionMs is undefined', () => {
    const result = computeResumeDelta({ lastSessionMs: undefined, nowMs: now, nodes: [], commits: [] })
    expect(result.reason).toBe('no_prior_session')
    expect(result.resume).toBe(false)
  })

  it('returns gap_below_threshold when gap is small', () => {
    const result = computeResumeDelta({
      lastSessionMs: now - 1000,
      nowMs: now,
      nodes: [makeNode('n1')],
      commits: [makeCommit('abc')],
    })
    expect(result.reason).toBe('gap_below_threshold')
    expect(result.resume).toBe(false)
  })

  it('returns delta_emitted when gap exceeds threshold', () => {
    const result = computeResumeDelta({
      lastSessionMs: now - SESSION_GAP_THRESHOLD_MS - 1000,
      nowMs: now,
      nodes: [makeNode('n1')],
      commits: [makeCommit('abc')],
    })
    expect(result.reason).toBe('delta_emitted')
    expect(result.resume).toBe(true)
  })
})
