/*!
 * TDD: GA autotune tick (node_95ea1db83eab, T6c).
 *
 * Wires runGaLoop into the done tick: read selection episodes → evolve → persist the
 * tuned genome into the aco_autotune lever, so the NEXT agf next --aco selects with
 * learned params. Gated by the lever + a cold-start guard, and never throws.
 *
 * AC1: after enough seeded episodes with the lever on, persisted α/β differ from defaults.
 * AC2: a GA failure must not propagate (the caller's done must still complete).
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { recordSelectionEpisode, type SelectionEpisode } from '../core/economy/selection-quality.js'
import { resolveEconomyLeversConfig, getLeverParams } from '../core/economy/economy-levers-config.js'
import { ALPHA } from '../core/economy/aco-params.js'
import { runGaTick } from '../core/economy/ga-tick.js'

function makeStore(): SqliteStore {
  const s = SqliteStore.open(':memory:')
  s.initProject('test-ga-tick')
  return s
}

// Target 't' has HIGH pheromone but LOW desirability → a higher α ranks it first, so the
// GA has a gradient AWAY from the default α.
const episode: SelectionEpisode = {
  candidates: [
    { id: 't', priority: 2, size: 2, blockingImpact: 0, acCount: 0, pheromone: 10 },
    { id: 'c', priority: 1, size: 1, blockingImpact: 5, acCount: 4, pheromone: 1 },
  ],
  targetId: 't',
}

function seedEpisodes(s: SqliteStore, n: number): void {
  const db = s.getDb()
  const p = s.getProject()!.id
  for (let i = 0; i < n; i++) recordSelectionEpisode(db, p, episode, 1000 + i)
}

describe('runGaTick', () => {
  // SMART-DEFAULT (regra 16): auto-engages on enough episodes WITHOUT needing the lever,
  // so the built GA capability actually delivers value in the consumer's default mode.
  it('AC1: with enough episodes it auto-runs (no lever) and persists a tuned α ≠ default', () => {
    const s = makeStore()
    seedEpisodes(s, 25)
    const res = runGaTick(s, { minEpisodes: 20, seed: 7 })
    expect(res.ran).toBe(true)
    expect(res.applied).toBe(true)
    const tuned = getLeverParams(resolveEconomyLeversConfig(s), 'aco_autotune')
    expect(tuned.alpha).toBeDefined()
    expect(tuned.alpha).not.toBe(ALPHA) // learned params differ from the defaults
    s.close()
  })

  it('cold-start guard: below the episode threshold it does not run or persist', () => {
    const s = makeStore()
    seedEpisodes(s, 5)
    const res = runGaTick(s, { minEpisodes: 20, seed: 7 })
    expect(res.ran).toBe(false)
    expect(res.reason).toBe('cold-start')
    expect(getLeverParams(resolveEconomyLeversConfig(s), 'aco_autotune').alpha).toBeUndefined()
    s.close()
  })

  it('AC3: opt-out via disabled:true → no-op (byte-identical escape hatch)', () => {
    const s = makeStore()
    seedEpisodes(s, 25)
    const res = runGaTick(s, { disabled: true, minEpisodes: 20, seed: 7 })
    expect(res.ran).toBe(false)
    expect(res.reason).toBe('disabled')
    s.close()
  })

  it('AC2: never throws — a GA failure is swallowed so done can still complete', () => {
    const s = makeStore()
    seedEpisodes(s, 25)
    s.close() // closed DB → any internal query throws; runGaTick must not propagate
    expect(() => runGaTick(s, { minEpisodes: 20, seed: 7 })).not.toThrow()
  })
})
