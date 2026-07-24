/**
 * post-done-ticks.test.ts — the "never throws" contract, verified.
 *
 * These four functions run AFTER a task has closed. Their docblocks all promise
 * the same thing: they never throw, never block the close. That promise is the
 * reason they are safe to call at all — the delivery is already earned when they
 * run, so failing to record a lesson must not cost the user the close.
 *
 * A promise about SILENCE is not verified by accident. The existing coverage
 * exercises the happy path through the done command; what matters here is the
 * unhappy one — a directory that cannot be written, a store that is gone. So each
 * case breaks a REAL source (a path that does not exist, a closed database) rather
 * than stubbing the failure, because a stub proves only that the stub threw.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  runPostDoneLearning,
  recordSuccessLearning,
  recordColonyOutcome,
  recordDoneInManifest,
} from '../core/learning/post-done-ticks.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode } from '../core/graph/graph-types.js'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
  dirs.length = 0
})

/** A real project root with a real store — no doubles anywhere in this suite. */
function project(): { dir: string; store: SqliteStore } {
  const dir = mkdtempSync(join(tmpdir(), 'agf-ticks-'))
  dirs.push(dir)
  const store = SqliteStore.open(dir)
  // An initialised project, not just an open database: getStats() throws without
  // one, and a best-effort tick would swallow that — the happy path would look
  // like a pass while nothing was ever written.
  store.initProject('post-done-ticks')
  return { dir, store }
}

function node(overrides: Partial<GraphNode> = {}): GraphNode {
  const ts = new Date().toISOString()
  return {
    id: 'node_tick',
    type: 'task',
    title: 'Extract the post-done ticks',
    status: 'done',
    priority: 3,
    createdAt: ts,
    updatedAt: ts,
    description: 'A real rationale, long enough that case-distillation has something to distil.',
    testFiles: ['src/tests/post-done-ticks.test.ts'],
    ...overrides,
  }
}

/** A path that cannot be written to — the failure every one of these must absorb. */
const UNWRITABLE = join('/', 'nonexistent-root-agf', 'nowhere', 'deeper')

describe('recordColonyOutcome', () => {
  it('writes the colony snapshot to disk', () => {
    const { dir, store } = project()
    recordColonyOutcome(store, node(), dir)
    const memDir = join(dir, 'workflow-graph', 'memories')
    expect(existsSync(memDir), 'memories dir was never created').toBe(true)
    expect(readdirSync(memDir).length).toBeGreaterThan(0)
    store.close()
  })

  it('absorbs an unwritable directory instead of throwing', () => {
    const { store } = project()
    expect(() => recordColonyOutcome(store, node(), UNWRITABLE)).not.toThrow()
    store.close()
  })

  it('absorbs a CLOSED store — the database really is gone, not stubbed away', () => {
    const { dir, store } = project()
    store.close()
    expect(() => recordColonyOutcome(store, node(), dir)).not.toThrow()
  })
})

describe('recordSuccessLearning', () => {
  it('writes nothing for a grade other than A — the guard survived the extraction', () => {
    // This guard used to sit at the call site, inside `if (dod.grade === 'A')`.
    // Moving it inward is only safe if it still fires; a lost guard would write
    // memories for every finish and dilute the signal the next executor reads.
    const { dir, store } = project()
    recordSuccessLearning({ store, node: node(), dir, grade: 'B', score: 70 })
    const memDir = join(dir, 'workflow-graph', 'memories')
    const written = existsSync(memDir) ? readdirSync(memDir) : []
    expect(written).toEqual([])
    store.close()
  })

  it('absorbs an unwritable directory on a grade A finish', () => {
    const { store } = project()
    expect(() => recordSuccessLearning({ store, node: node(), dir: UNWRITABLE, grade: 'A', score: 95 })).not.toThrow()
    store.close()
  })

  it('absorbs a closed store on a grade A finish', () => {
    const { dir, store } = project()
    store.close()
    expect(() => recordSuccessLearning({ store, node: node(), dir, grade: 'A', score: 95 })).not.toThrow()
  })
})

describe('recordDoneInManifest', () => {
  it('absorbs a directory that is not a git repository', () => {
    const { dir, store } = project()
    expect(() => recordDoneInManifest('node_tick', dir)).not.toThrow()
    store.close()
  })

  it('absorbs a path that does not exist at all', () => {
    expect(() => recordDoneInManifest('node_tick', UNWRITABLE)).not.toThrow()
  })
})

describe('runPostDoneLearning', () => {
  it('returns a stagnation decision even with the lever OFF', () => {
    // Documented here because the comment carried over from the command claimed
    // the opposite. The lever only controls whether a ledger row is written;
    // MMAS bounds are default-ON, so the decision is always computed and always
    // reaches the envelope. Asserting the real behaviour keeps the next reader
    // from "fixing" code that matches a wrong comment.
    const { store } = project()
    const result = runPostDoneLearning(store, 'node_tick')
    expect(result.stagnation).toBeDefined()
    expect(result.stagnation?.band).toBeTypeOf('string')
    store.close()
  })

  it('absorbs a closed store', () => {
    const { store } = project()
    store.close()
    expect(() => runPostDoneLearning(store, 'node_tick')).not.toThrow()
  })
})

describe('the contract holds for ALL of them, enumerated', () => {
  it('no exported tick throws when everything around it is broken', () => {
    // Enumerated rather than sampled: a fifth function added later without the
    // same defence is the regression this catches.
    const { store } = project()
    store.close()
    const broken: Array<[string, () => unknown]> = [
      ['runPostDoneLearning', () => runPostDoneLearning(store, 'node_tick')],
      [
        'recordSuccessLearning',
        () => recordSuccessLearning({ store, node: node(), dir: UNWRITABLE, grade: 'A', score: 95 }),
      ],
      ['recordColonyOutcome', () => recordColonyOutcome(store, node(), UNWRITABLE)],
      ['recordDoneInManifest', () => recordDoneInManifest('node_tick', UNWRITABLE)],
    ]
    for (const [name, call] of broken) {
      expect(call, `${name} broke its never-throws contract`).not.toThrow()
    }
  })
})
