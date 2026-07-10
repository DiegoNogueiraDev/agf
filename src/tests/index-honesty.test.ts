/*!
 * Task node_859d6f2e87f2 — computeIndexHonesty: ratio + bruteForce flag.
 *
 * AC1: selection 5, corpusSize 100 → ratio===0.05, bruteForce===false.
 * AC2: selection 60, corpusSize 100 → bruteForce===true.
 * AC3: corpusSize < 20 → bruteForce===false regardless of ratio.
 */

import { describe, it, expect } from 'vitest'
import { computeIndexHonesty } from '../core/memory/index-honesty.js'
import type { SelectionResult } from '../core/memory/memory-salience.js'

function sel(n: number): SelectionResult {
  return { kept: new Array(n).fill({ id: 'x', content: '', score: 0 }), droppedTokens: 0 }
}

describe('computeIndexHonesty', () => {
  it('ratio 0.05, bruteForce false when below threshold (AC1)', () => {
    const r = computeIndexHonesty(sel(5), 100)
    expect(r.ratio).toBeCloseTo(0.05)
    expect(r.bruteForce).toBe(false)
  })

  it('bruteForce true when ratio > 0.5 and corpusSize >= 20 (AC2)', () => {
    const r = computeIndexHonesty(sel(60), 100)
    expect(r.bruteForce).toBe(true)
  })

  it('bruteForce false when corpusSize < 20 (AC3)', () => {
    const r = computeIndexHonesty(sel(15), 19)
    expect(r.bruteForce).toBe(false)
  })
})
