/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * improve-lazy-pheromone [P2] — Lazy guard for pheromone-trail reads.
 *
 * The loop reads pheromone trails every cycle even when none are deposited
 * (new project / cold colony). `readPheromoneTrailsLazy` skips the read and
 * returns empty when the deposited-trail count is below a threshold N (default
 * 1), so a cold colony pays zero read cost.
 *
 * AC: zero read on an empty colony (count 0); a normal read once ≥ N trails exist.
 */
import { describe, it, expect, vi } from 'vitest'
import { readPheromoneTrailsLazy } from '../core/colony/pheromone-memory.js'

describe('improve-lazy-pheromone: readPheromoneTrailsLazy', () => {
  it('does NOT invoke the read on an empty colony (count 0) and returns []', () => {
    const read = vi.fn(() => ['trail-a', 'trail-b'])
    const result = readPheromoneTrailsLazy(0, read)
    expect(result).toEqual([])
    expect(read).not.toHaveBeenCalled()
  })

  it('invokes the read exactly once when count ≥ default threshold (1)', () => {
    const read = vi.fn(() => ['trail-a'])
    const result = readPheromoneTrailsLazy(1, read)
    expect(result).toEqual(['trail-a'])
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('respects a custom threshold N — below it skips, at/above it reads', () => {
    const read = vi.fn(() => [42])

    expect(readPheromoneTrailsLazy(2, read, { threshold: 3 })).toEqual([])
    expect(read).not.toHaveBeenCalled()

    expect(readPheromoneTrailsLazy(3, read, { threshold: 3 })).toEqual([42])
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('is generic over the trail element type', () => {
    const read = vi.fn(() => [{ file: 'x.ts', strength: 0.9 }])
    const result = readPheromoneTrailsLazy(5, read)
    expect(result[0]?.file).toBe('x.ts')
  })

  it('treats a negative or zero count as a cold colony (defensive)', () => {
    const read = vi.fn(() => ['t'])
    expect(readPheromoneTrailsLazy(-3, read)).toEqual([])
    expect(read).not.toHaveBeenCalled()
  })
})
