import { describe, it, expect, vi } from 'vitest'
import { waitForApproval, ApprovalTimeoutError } from '../../core/approval/signal-file-watcher.js'

describe('signal-file-watcher', () => {
  it('timeout after interval returns ApprovalTimeoutError', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined)
    const readFile = vi.fn().mockReturnValue(null)
    const nowFn = vi
      .fn()
      .mockReturnValueOnce(0) // start: now = 0
      .mockReturnValueOnce(999999) // after sleep: now > deadline

    await expect(
      waitForApproval({
        taskId: 'task-1',
        timeoutMs: 100,
        intervalMs: 10,
        readFile,
        nowFn,
        sleep,
      }),
    ).rejects.toThrow(ApprovalTimeoutError)
  })

  it('signal file with approved:true returns immediately', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined)
    const readFile = vi.fn().mockReturnValue(JSON.stringify({ approved: true }))

    await expect(
      waitForApproval({
        taskId: 'task-1',
        timeoutMs: 5000,
        intervalMs: 10,
        readFile,
        sleep,
      }),
    ).resolves.toBeUndefined()

    expect(sleep).not.toHaveBeenCalled()
  })

  it('signal file appears after delay resolves correctly', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined)
    let callCount = 0
    const readFile = vi.fn(() => {
      callCount++
      return callCount >= 3 ? JSON.stringify({ approved: true }) : null
    })
    const nowFn = vi.fn(() => 0)

    await expect(
      waitForApproval({
        taskId: 'task-1',
        timeoutMs: 5000,
        intervalMs: 10,
        readFile,
        nowFn,
        sleep,
      }),
    ).resolves.toBeUndefined()

    expect(callCount).toBe(3)
  })

  it('invalid JSON in signal file does not approve', async () => {
    const readFile = vi.fn().mockReturnValue('not-json')
    const nowFn = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(999999)

    await expect(
      waitForApproval({
        taskId: 'task-1',
        timeoutMs: 100,
        intervalMs: 10,
        readFile,
        nowFn,
      }),
    ).rejects.toThrow(ApprovalTimeoutError)
  })
})
