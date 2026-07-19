/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_wire_724b28086719 — shared-findings guard wired into the parallel
 * delegate loop. When a SharedFindings store is supplied, a result whose
 * content was already recorded by a sibling is flagged `deduped: true` so
 * callers can skip acting on a duplicate discovery. Absent → identical to
 * today (no `findings` bucket).
 */
import { describe, it, expect, vi } from 'vitest'
import { delegateSubtasksParallel } from '../core/autonomy/delegate-parallel.js'
import { createSharedFindings } from '../core/autonomy/shared-findings.js'

function subtasks(...ids: string[]): Array<{ id: string; title: string }> {
  return ids.map((id) => ({ id, title: id }))
}

describe('delegate-parallel — shared-findings dedup (#node_wire_724b28086719)', () => {
  it('flags a result as deduped when its summary content was already recorded', async () => {
    const findings = createSharedFindings()
    const run = vi.fn(async () => ({ success: true, tokensUsed: 1, summary: 'same finding' }))

    const report = await delegateSubtasksParallel(subtasks('node_a', 'node_b'), { runSubagent: run }, { findings })

    expect(report.results[0].deduped).toBeUndefined()
    expect(report.results[1].deduped).toBe(true)
    expect(report.deduped).toBe(1)
  })

  it('keeps distinct summaries un-deduped', async () => {
    const findings = createSharedFindings()
    let n = 0
    const run = vi.fn(async () => ({ success: true, tokensUsed: 1, summary: `finding-${n++}` }))

    const report = await delegateSubtasksParallel(subtasks('node_a', 'node_b'), { runSubagent: run }, { findings })

    expect(report.results.every((r) => r.deduped === undefined)).toBe(true)
    expect(report.deduped).toBe(0)
  })

  it('without a SharedFindings store, behaviour is unchanged', async () => {
    const run = vi.fn(async () => ({ success: true, tokensUsed: 1, summary: 'same finding' }))
    const report = await delegateSubtasksParallel(subtasks('node_a', 'node_b'), { runSubagent: run })

    expect(report.results.every((r) => r.deduped === undefined)).toBe(true)
    expect(report.deduped).toBe(0)
  })
})
