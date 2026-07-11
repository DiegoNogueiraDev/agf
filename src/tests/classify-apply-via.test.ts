/*!
 * TDD: classifyApplyVia — deterministic vs judgment-needed (node_5f48389af499).
 *
 * AC: Given a traceability_break gap, when classified, then mode == 'deterministic'.
 */

import { describe, it, expect } from 'vitest'
import { classifyApplyVia } from '../core/gaps/gap-applier.js'
import type { GapKind } from '../core/gaps/gap-types.js'

describe('classifyApplyVia', () => {
  it('traceability_break → deterministic', () => {
    const mode = classifyApplyVia('traceability_break' as GapKind, ['agf edge add --from x --to y'])
    expect(mode).toBe('deterministic')
  })

  it('missing_traceability_edge → deterministic', () => {
    const mode = classifyApplyVia('missing_traceability_edge' as GapKind, [
      'agf edge add --from a --to b --type implements',
    ])
    expect(mode).toBe('deterministic')
  })

  it('weak_ac_testability → judgment-needed (judgment kind)', () => {
    const mode = classifyApplyVia('weak_ac_testability' as GapKind, ['agf node update ...'])
    expect(mode).toBe('judgment-needed')
  })

  it('ambiguous_ac → judgment-needed (judgment kind)', () => {
    const mode = classifyApplyVia('ambiguous_ac' as GapKind, ['agf node update ...'])
    expect(mode).toBe('judgment-needed')
  })

  it('design_drift → judgment-needed (judgment kind)', () => {
    const mode = classifyApplyVia('design_drift' as GapKind, ['agf edge add --from d1 --to <requirementId>'])
    expect(mode).toBe('judgment-needed')
  })

  it('applyVia with placeholder → judgment-needed regardless of kind', () => {
    const mode = classifyApplyVia('traceability_break' as GapKind, ['agf edge add --from <taskId> --to x'])
    expect(mode).toBe('judgment-needed')
  })
})
