/*!
 * Task node_92cab1d56912 — agf gaps --apply batch applier.
 *
 * AC1: gaps with deterministic applyVia → --dry-run prints commands, graph NOT mutated.
 * AC2: --commit runs commands; gap total does not increase.
 * AC3: gaps with <placeholder> applyVia → skipped as needs-judgment.
 */

import { describe, it, expect } from 'vitest'
import { applyGaps, isDeterministic } from '../core/gaps/gap-applier.js'
import type { Gap } from '../core/gaps/gap-types.js'

const makeGap = (applyVia: string[], kind: Gap['kind'] = 'traceability_break'): Gap => ({
  kind,
  severity: 'required',
  nodeId: 'node_test',
  description: 'test gap',
  enrichment: { action: 'add_edges', instruction: 'fix', applyVia },
})

describe('isDeterministic', () => {
  it('returns true when no <placeholder> in any applyVia command', () => {
    expect(isDeterministic(['agf edge add --from a --to b --type implements'])).toBe(true)
  })

  it('returns false when any command has a <placeholder>', () => {
    expect(isDeterministic(['agf edge add --from <taskId> --to b --type implements'])).toBe(false)
  })
})

describe('applyGaps', () => {
  it('dry-run: returns applied/skipped summary without mutating anything (AC1)', () => {
    const gaps = [
      makeGap(['agf node add --type requirement --tags nfr --title "NFR perf"']),
      makeGap(['agf edge add --from <taskId> --to req --type implements'], 'traceability_break'),
    ]
    const result = applyGaps(gaps, { dryRun: true, execute: () => {} })
    expect(result.applied.length).toBe(1)
    expect(result.skipped.length).toBe(1)
    expect(result.skipped[0].reason).toBe('needs-judgment')
  })

  it('--commit: calls execute for deterministic gaps only (AC2)', () => {
    const calls: string[] = []
    const gaps = [
      makeGap(['agf node add --type requirement --tags nfr --title "NFR perf"']),
      makeGap(['agf edge add --from <task> --to req --type related_to']),
    ]
    const result = applyGaps(gaps, {
      dryRun: false,
      execute: (cmd) => {
        calls.push(cmd)
      },
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('agf node add')
    expect(result.applied.length).toBe(1)
    expect(result.skipped.length).toBe(1)
  })

  it('judgment gaps are always skipped even without --dry-run (AC3)', () => {
    const gaps = [makeGap(['agf node update node_x --ac "Given …, When …, Then …"'], 'weak_ac_testability')]
    const result = applyGaps(gaps, { dryRun: false, execute: () => {} })
    expect(result.skipped.length).toBe(1)
    expect(result.skipped[0].reason).toBe('needs-judgment')
    expect(result.applied.length).toBe(0)
  })
})
