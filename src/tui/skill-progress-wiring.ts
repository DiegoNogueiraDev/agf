/*!
 * skill-progress-wiring — pure factory/mapper for SkillHandlerPort → SkillProgress.
 *
 * WHY: The interactive-app onProgress callback previously only appended text
 * but never updated setSkillStep. This module extracts the mapping so it is
 * testable without Ink, and provides buildSkillContext to assemble the full
 * SkillExecutionContext in one place.
 *
 * Composes with: interactive-app.tsx (consumer), SkillProgress.tsx (display),
 * skill-handler-port.ts (types), core/autonomy/token-ledger.ts (ledger).
 */

import { TokenLedger } from '../core/autonomy/token-ledger.js'
import type { SkillStep, SkillExecutionContext } from './skill-handler-port.js'
import type { SqliteStore } from '../core/store/sqlite-store.js'
import { createSessionStore, type ExtensionData } from '../core/plugins/extension-data.js'

/** Shape expected by the SkillProgress Ink component. */
export interface SkillProgressState {
  total: number
  completed: number
  label: string
}

/** Maps a SkillStep event to SkillProgressState (pure). */
export function toSkillProgressState(step: SkillStep): SkillProgressState {
  return { total: step.total, completed: step.step, label: step.label }
}

export interface SkillContextOptions {
  store?: SqliteStore
  dir: string
  testCmd: string
  onProgressUpdate: (state: SkillProgressState) => void
  appendFn: (text: string) => void
  /** Session-scoped store to persist across skill calls; a fresh one is created when omitted. */
  session?: ExtensionData
}

/** Builds a SkillExecutionContext wired to both progress display and append log. */
export function buildSkillContext(opts: SkillContextOptions): SkillExecutionContext {
  const ledger = new TokenLedger()
  return {
    store: opts.store as SqliteStore,
    dir: opts.dir,
    testCmd: opts.testCmd,
    ledger,
    onProgress: (step: SkillStep) => {
      opts.onProgressUpdate(toSkillProgressState(step))
      opts.appendFn(`  [${step.step}/${step.total}] ${step.label} (${step.elapsedMs}ms)`)
    },
    signal: { aborted: false },
    session: opts.session ?? createSessionStore(),
  }
}
