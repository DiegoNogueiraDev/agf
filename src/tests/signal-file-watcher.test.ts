/*!
 * Tests for signal-file-watcher.ts — waitForApproval injectable logic.
 *
 * waitForApproval accepts injectable readFile, nowFn, and sleep, making
 * all behavior testable without real FS, real timers, or mocks.
 *
 * Covers: constants, ApprovalTimeoutError message/name, immediate resolve,
 * timeout error, multi-poll-then-resolve, invalid JSON, non-approved payload.
 */

import { describe, it, expect } from 'vitest'
import {
  waitForApproval,
  ApprovalTimeoutError,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_INTERVAL_MS,
  APPROVAL_DIR,
} from '../core/approval/signal-file-watcher.js'

// ── constants ─────────────────────────────────────────────────────────────────

describe('signal-file-watcher — constants', () => {
  it('DEFAULT_TIMEOUT_MS is 300000 (5 minutes)', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(300_000)
  })

  it('DEFAULT_INTERVAL_MS is 500', () => {
    expect(DEFAULT_INTERVAL_MS).toBe(500)
  })

  it('APPROVAL_DIR is ".workflow-approvals"', () => {
    expect(APPROVAL_DIR).toBe('.workflow-approvals')
  })
})

// ── ApprovalTimeoutError ──────────────────────────────────────────────────────

describe('ApprovalTimeoutError', () => {
  it('has name "ApprovalTimeoutError"', () => {
    const err = new ApprovalTimeoutError('task_abc', 5000)
    expect(err.name).toBe('ApprovalTimeoutError')
  })

  it('is an instance of Error', () => {
    const err = new ApprovalTimeoutError('task_abc', 5000)
    expect(err).toBeInstanceOf(Error)
  })

  it('includes taskId in message', () => {
    const err = new ApprovalTimeoutError('node_xyz123', 5000)
    expect(err.message).toContain('node_xyz123')
  })

  it('includes timeout value in message', () => {
    const err = new ApprovalTimeoutError('task_abc', 10000)
    expect(err.message).toContain('10000')
  })
})

// ── waitForApproval — immediate resolve ──────────────────────────────────────

describe('waitForApproval — immediate resolve', () => {
  it('resolves immediately when signal file has approved=true', async () => {
    const approved = JSON.stringify({ approved: true })
    await expect(
      waitForApproval({
        taskId: 'task_001',
        readFile: () => approved,
        nowFn: () => 0,
        sleep: async () => {},
        timeoutMs: 5000,
      }),
    ).resolves.toBeUndefined()
  })

  it('resolves when approved=true with extra fields in payload', async () => {
    const payload = JSON.stringify({ approved: true, comment: 'looks good', reviewer: 'alice' })
    await expect(
      waitForApproval({
        taskId: 'task_001',
        readFile: () => payload,
        nowFn: () => 0,
        sleep: async () => {},
        timeoutMs: 5000,
      }),
    ).resolves.toBeUndefined()
  })
})

// ── waitForApproval — timeout ─────────────────────────────────────────────────

describe('waitForApproval — timeout', () => {
  it('throws ApprovalTimeoutError when file is never created', async () => {
    let tick = 0
    await expect(
      waitForApproval({
        taskId: 'task_timeout',
        readFile: () => null, // file never appears
        nowFn: () => (tick++ > 2 ? 6000 : 0), // deadline exceeded after 3 calls
        sleep: async () => {},
        timeoutMs: 5000,
      }),
    ).rejects.toBeInstanceOf(ApprovalTimeoutError)
  })

  it('throws ApprovalTimeoutError with correct taskId', async () => {
    let tick = 0
    await expect(
      waitForApproval({
        taskId: 'my_task_id',
        readFile: () => null,
        nowFn: () => (tick++ > 1 ? 9999 : 0),
        sleep: async () => {},
        timeoutMs: 1000,
      }),
    ).rejects.toSatisfy((err: unknown) => err instanceof ApprovalTimeoutError && err.message.includes('my_task_id'))
  })
})

// ── waitForApproval — multi-poll ──────────────────────────────────────────────

describe('waitForApproval — multi-poll then resolve', () => {
  it('resolves after polling several times before approval arrives', async () => {
    let callCount = 0
    const readFile = (): string | null => {
      callCount++
      if (callCount < 4) return null // file not present yet
      return JSON.stringify({ approved: true })
    }
    await expect(
      waitForApproval({
        taskId: 'task_delayed',
        readFile,
        nowFn: () => 0, // never timeout
        sleep: async () => {},
        timeoutMs: 60_000,
      }),
    ).resolves.toBeUndefined()
    expect(callCount).toBeGreaterThanOrEqual(4)
  })

  it('calls sleep between polls', async () => {
    let sleepCalls = 0
    let callCount = 0
    const readFile = (): string | null => {
      callCount++
      return callCount >= 3 ? JSON.stringify({ approved: true }) : null
    }
    await waitForApproval({
      taskId: 'task_sleep',
      readFile,
      nowFn: () => 0,
      sleep: async () => {
        sleepCalls++
      },
      timeoutMs: 60_000,
    })
    expect(sleepCalls).toBeGreaterThanOrEqual(2)
  })
})

// ── waitForApproval — non-approved payload ────────────────────────────────────

describe('waitForApproval — rejected payloads', () => {
  it('does not resolve for approved=false payload', async () => {
    let tick = 0
    const payload = JSON.stringify({ approved: false })
    await expect(
      waitForApproval({
        taskId: 'task_rejected',
        readFile: () => payload,
        nowFn: () => (tick++ > 2 ? 9999 : 0),
        sleep: async () => {},
        timeoutMs: 1000,
      }),
    ).rejects.toBeInstanceOf(ApprovalTimeoutError)
  })

  it('does not resolve for invalid JSON content', async () => {
    let tick = 0
    await expect(
      waitForApproval({
        taskId: 'task_invalid_json',
        readFile: () => 'not-json-content',
        nowFn: () => (tick++ > 2 ? 9999 : 0),
        sleep: async () => {},
        timeoutMs: 1000,
      }),
    ).rejects.toBeInstanceOf(ApprovalTimeoutError)
  })

  it('does not resolve for empty object payload', async () => {
    let tick = 0
    await expect(
      waitForApproval({
        taskId: 'task_empty',
        readFile: () => '{}',
        nowFn: () => (tick++ > 2 ? 9999 : 0),
        sleep: async () => {},
        timeoutMs: 1000,
      }),
    ).rejects.toBeInstanceOf(ApprovalTimeoutError)
  })
})
