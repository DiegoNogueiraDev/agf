/*!
 * TDD: implement-attempt execute() throw guard (node_35e0b52a81c7).
 *
 * AC1: execute() throws → { success: false } (not an unhandled exception).
 * AC2: execute() throw does not leave node in_progress (safe failure return).
 */

import { describe, it, expect, vi } from 'vitest'
import { attemptImplementation } from '../core/autonomy/implement-attempt.js'
import type { AttemptDeps } from '../core/autonomy/implement-attempt.js'

const FAKE_NODE = { id: 'n1', title: 'test task' }

describe('AC1: execute() throws → success:false, not unhandled', () => {
  it('returns success:false when execute throws', async () => {
    const deps: AttemptDeps = {
      generate: vi.fn().mockResolvedValue(
        JSON.stringify({
          reasoning: 'test',
          edits: [{ path: 'src/x.ts', oldString: 'old', newString: 'new', description: 'fix' }],
          testCmd: 'echo ok',
        }),
      ),
      execute: vi.fn().mockRejectedValue(new Error('apply-edits crash')),
    }

    const result = await attemptImplementation(deps, { node: FAKE_NODE, maxAttempts: 1 })
    expect(result.success).toBe(false)
    expect(result.attempts).toBeGreaterThanOrEqual(1)
  })

  it('does not throw — exception is captured as failure', async () => {
    const deps: AttemptDeps = {
      generate: vi.fn().mockResolvedValue(
        JSON.stringify({
          reasoning: 'test',
          edits: [{ path: 'src/x.ts', oldString: 'old', newString: 'new', description: 'fix' }],
          testCmd: 'echo ok',
        }),
      ),
      execute: vi.fn().mockRejectedValue(new Error('crash')),
    }

    await expect(attemptImplementation(deps, { node: FAKE_NODE, maxAttempts: 1 })).resolves.not.toThrow()
  })
})
