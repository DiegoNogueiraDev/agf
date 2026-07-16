/*!
 * Persist session-accumulated facts to the memory store on agf done.
 * Task node_8c01deba8586.
 *
 * WHY: extractFacts runs on every tool:post-call and pushes to an in-process
 * buffer (context-injection.ts). Without persistence these facts vanish when
 * the process ends — cross-session context is lost. This module flushes the
 * buffer to a timestamped markdown file in workflow-graph/memories/ on done.
 *
 * Contract: never throws (done flow must always complete regardless of I/O).
 * Composes with: extract-keywords.ts (format), context-injection.ts (buffer),
 * done-cmd.ts (call site, finally block).
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getCompactFacts, resetFacts } from './context-injection.js'

export interface PersistFactsOptions {
  /** Reset the in-memory buffer after persisting. Default false. */
  resetAfter?: boolean
}

/**
 * Flush accumulated session facts to a markdown file in <projectDir>/workflow-graph/memories/.
 * No-op when there are no accumulated facts. Never throws.
 */
export function persistAccumulatedFacts(projectDir: string, opts: PersistFactsOptions = {}): void {
  try {
    const content = getCompactFacts()
    if (!content) return

    const memDir = join(projectDir, 'workflow-graph', 'memories')
    mkdirSync(memDir, { recursive: true })

    const stamp = Date.now().toString(36)
    const fileName = `extracted-facts-${stamp}.md`
    writeFileSync(join(memDir, fileName), `# Auto-Extracted Facts\n\n${content}\n`, 'utf-8')

    if (opts.resetAfter) resetFacts()
  } catch {
    // Never propagate — done flow must complete regardless of I/O errors.
  }
}
