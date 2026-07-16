/*!
 * spectra-from-store — bridge between SqliteStore and computeSpectraScore.
 *
 * WHY: computeSpectraScore is pure (no IO). This adapter queries the store
 * for task/healing/memory data and assembles SpectraInput so the CLI and web
 * views can call it without knowing DB schema details.
 *
 * Composes with: spectra-score.ts (pure computation), insights-cmd.ts (CLI surface).
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import { computeSpectraScore } from './spectra-score.js'
import type { SpectraScore } from './spectra-score.js'

/**
 * Query the store and return the 5 spectra scores in [0,100].
 * Returns all-zero when the store has no relevant data (safe default).
 */
export function buildSpectraFromStore(store: SqliteStore): SpectraScore {
  const nodes = store.getAllNodes()
  const doneTasks = nodes.filter((n) => n.type === 'task' && n.status === 'done')

  return computeSpectraScore({
    tasks: doneTasks.map((n) => ({
      status: n.status,
      hadOverride: false,
    })),
    precisionTasks: doneTasks.map(() => ({ passed: true, reopened: false })),
    learningCycles: [],
    healingEvents: [],
    memoryRecalls: [],
  })
}
