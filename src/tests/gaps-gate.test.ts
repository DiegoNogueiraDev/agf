/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §node_a750f16d3adb — gaps pre-gate: a required-severity gap anchored to the
 * next node blocks (escalates); clean nodes pass. Deterministic, ~0 token.
 */
import { describe, it, expect } from 'vitest'
import { gapsToGateDecision } from '../core/autonomy/gaps-gate.js'
import { buildGapReport } from '../core/gaps/gap-types.js'
import type { Gap } from '../core/gaps/gap-types.js'

const requiredGap = (nodeId?: string): Gap => ({
  kind: 'ac_coverage',
  severity: 'required',
  nodeId,
  evidence: 'AC#3 has no `tests` edge',
  enrichment: { action: 'link', instruction: 'link AC to a test', applyVia: ['agf edge add ...'] },
})
const recommendedGap = (nodeId: string): Gap => ({
  kind: 'edge_cases',
  severity: 'recommended',
  nodeId,
  evidence: 'no error-path AC',
  enrichment: { action: 'add', instruction: 'add edge-case AC', applyVia: ['agf node add ...'] },
})

describe('gapsToGateDecision (#node_a750f16d3adb)', () => {
  it('blocks when a required gap is anchored to the node', () => {
    const report = buildGapReport([requiredGap('task-1')])
    const decision = gapsToGateDecision(report, 'task-1')
    expect(decision.block).toBe(true)
    expect(decision.reason).toContain('ac_coverage')
  })

  it('does NOT block when the required gap is anchored to a different node', () => {
    const report = buildGapReport([requiredGap('other')])
    expect(gapsToGateDecision(report, 'task-1').block).toBe(false)
  })

  it('does NOT block on a recommended gap', () => {
    const report = buildGapReport([recommendedGap('task-1')])
    expect(gapsToGateDecision(report, 'task-1').block).toBe(false)
  })

  it('does NOT block when there are no gaps', () => {
    expect(gapsToGateDecision(buildGapReport([]), 'task-1').block).toBe(false)
  })
})
