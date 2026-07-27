/*!
 * TDD: dry-run printer for deterministic applies (node_9b63ef6302ea).
 *
 * AC: Given --dry-run, when run, then graph node count is unchanged before and after.
 */

import { describe, it, expect } from 'vitest'
import { applyGaps, formatDryRunCommands } from '../core/gaps/gap-applier.js'
import type { Gap } from '../core/gaps/gap-types.js'

function makeGap(kind: string, applyVia: string[]): Gap {
  return {
    id: `gap-${kind}`,
    kind: kind as Gap['kind'],
    severity: 'required',
    nodeId: 'node_test',
    nodeTitle: 'Test node',
    enrichment: { applyVia },
  }
}

describe('dry-run printer', () => {
  it('dry-run does not call execute', () => {
    const calls: string[] = []
    const gaps = [makeGap('traceability_break', ['agf edge add --from a --to b'])]
    applyGaps(gaps, { dryRun: true, execute: (cmd) => calls.push(cmd) })
    expect(calls).toHaveLength(0)
  })

  it('formatDryRunCommands extracts applyVia from deterministic applied gaps', () => {
    const gaps = [makeGap('traceability_break', ['agf edge add --from a --to b', 'agf node update c'])]
    const result = applyGaps(gaps, { dryRun: true, execute: () => {} })
    const cmds = formatDryRunCommands(result)
    expect(cmds).toEqual(['agf edge add --from a --to b', 'agf node update c'])
  })

  it('formatDryRunCommands skips judgment-needed gaps', () => {
    const gaps = [
      makeGap('weak_ac_testability', ['agf node update <nodeId>']),
      makeGap('traceability_break', ['agf edge add --from x --to y']),
    ]
    const result = applyGaps(gaps, { dryRun: true, execute: () => {} })
    const cmds = formatDryRunCommands(result)
    expect(cmds).toEqual(['agf edge add --from x --to y'])
  })

  it('formatDryRunCommands returns empty array when no gaps', () => {
    const result = applyGaps([], { dryRun: true, execute: () => {} })
    const cmds = formatDryRunCommands(result)
    expect(cmds).toEqual([])
  })
})
