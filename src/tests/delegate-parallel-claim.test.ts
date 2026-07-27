/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_df98c09346c1 — claim guard wired into the parallel delegate loop.
 * When a ClaimPort is supplied, each subtask is claimed before running and the
 * lease released after; a contended subtask is skipped cleanly (never run twice,
 * never counted as a failure). Absent ClaimPort → identical to today.
 */
import { describe, it, expect, vi } from 'vitest'
import { delegateSubtasksParallel, type ClaimPort } from '../core/autonomy/delegate-parallel.js'

const ok = { success: true, tokensUsed: 1 }

function subtasks(...ids: string[]): Array<{ id: string; title: string }> {
  return ids.map((id) => ({ id, title: id }))
}

describe('delegate-parallel — claim guard (#node_df98c09346c1)', () => {
  it('skips a subtask whose claim is contended (no double-run, not a failure)', async () => {
    const run = vi.fn(async () => ok)
    const released: string[] = []
    // node_b is already claimed by a peer → tryClaim returns null
    const claim: ClaimPort = {
      tryClaim: (resourceId) => (resourceId === 'node_b' ? null : { leaseToken: `lease_${resourceId}` }),
      release: (token) => released.push(token),
    }

    const report = await delegateSubtasksParallel(
      subtasks('node_a', 'node_b', 'node_c'),
      { runSubagent: run },
      { claim },
    )

    // node_b never executed
    const ranIds = run.mock.calls.map((c) => (c[0] as { id: string }).id)
    expect(ranIds).not.toContain('node_b')
    expect(ranIds).toEqual(expect.arrayContaining(['node_a', 'node_c']))
    // skip is its own bucket — not a failure
    expect(report.skipped).toBe(1)
    expect(report.failed).toBe(0)
    expect(report.completed).toBe(2)
    // leases for the two that ran were released
    expect(released).toEqual(expect.arrayContaining(['lease_node_a', 'lease_node_c']))
  })

  it('releases the lease even when the subagent throws', async () => {
    const released: string[] = []
    const claim: ClaimPort = {
      tryClaim: (resourceId) => ({ leaseToken: `lease_${resourceId}` }),
      release: (token) => released.push(token),
    }
    const run = vi.fn(async () => {
      throw new Error('boom')
    })

    const report = await delegateSubtasksParallel(subtasks('node_a'), { runSubagent: run }, { claim })

    expect(report.failed).toBe(1)
    expect(released).toEqual(['lease_node_a'])
  })

  it('without a ClaimPort, behaviour is unchanged (skipped stays 0)', async () => {
    const run = vi.fn(async () => ok)
    const report = await delegateSubtasksParallel(subtasks('node_a', 'node_b'), { runSubagent: run })
    expect(report.completed).toBe(2)
    expect(report.skipped).toBe(0)
    expect(run).toHaveBeenCalledTimes(2)
  })
})
