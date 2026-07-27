/*!
 * Task node_859d6f2e87f2 — computeIndexHonesty: ratio + bruteForce flag.
 * Task node_wire_e02f83681e80 — wired as the single source of truth for
 * memory-salience.ts's bruteForce detection (was duplicated, unreachable).
 *
 * AC1: selected 5, corpusSize 100 → ratio===0.05, bruteForce===false.
 * AC2: selected 60, corpusSize 100 → bruteForce===true.
 * AC3: corpusSize < 20 → bruteForce===false regardless of ratio.
 * AC4: memory-salience's computeIndexHonesty delegates to this module's
 *      bruteForce result instead of reimplementing the threshold math.
 */

import { describe, it, expect } from 'vitest'
import { computeIndexHonesty } from '../core/memory/index-honesty.js'
import { computeIndexHonesty as computeIndexHonestyViaSalience } from '../core/memory/memory-salience.js'

describe('computeIndexHonesty', () => {
  it('ratio 0.05, bruteForce false when below threshold (AC1)', () => {
    const r = computeIndexHonesty(5, 100)
    expect(r.ratio).toBeCloseTo(0.05)
    expect(r.bruteForce).toBe(false)
  })

  it('bruteForce true when ratio > 0.5 and corpusSize >= 20 (AC2)', () => {
    const r = computeIndexHonesty(60, 100)
    expect(r.bruteForce).toBe(true)
  })

  it('bruteForce false when corpusSize < 20 (AC3)', () => {
    const r = computeIndexHonesty(15, 19)
    expect(r.bruteForce).toBe(false)
  })

  it('memory-salience delegates to this module, not a duplicate (AC4)', () => {
    for (const [selected, corpusSize] of [
      [5, 100],
      [60, 100],
      [15, 19],
    ] as const) {
      const viaSalience = computeIndexHonestyViaSalience({ selected, corpusSize })
      const viaCore = computeIndexHonesty(selected, corpusSize)
      expect(viaSalience.bruteForce).toBe(viaCore.bruteForce)
    }
  })
})
