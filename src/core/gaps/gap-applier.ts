/*!
 * Gap applier — deterministic batch executor for gaps with concrete applyVia commands.
 *
 * WHY: Gaps whose applyVia commands have no <placeholder> tokens can be applied
 * without human judgment. This module separates those from judgment-needed gaps
 * and runs them (or dry-runs) so the conducting agent closes trivial completeness
 * gaps in one call.
 *
 * Composes with: gaps-cmd.ts (--apply / --commit flags), gap-types.ts (Gap).
 * Contract: never mutates the graph in dry-run mode; always skips placeholder cmds.
 */

import type { Gap, GapKind } from './gap-types.js'

/** Gap kinds that always require human judgment even when applyVia looks concrete. */
const JUDGMENT_KINDS = new Set<GapKind>(['weak_ac_testability', 'ambiguous_ac', 'design_drift'])

export interface ApplyGapsOptions {
  dryRun: boolean
  /** Injected executor — `(cmd: string) => void`; in production uses execSync. */
  execute: (cmd: string) => void
}

export interface SkippedGap {
  gap: Gap
  reason: 'needs-judgment'
}

export interface ApplyGapsResult {
  applied: Gap[]
  skipped: SkippedGap[]
}

/** True when all applyVia commands are free of `<placeholder>` tokens. */
export function isDeterministic(applyVia: string[]): boolean {
  return applyVia.every((cmd) => !/<[^>]+>/.test(cmd))
}

export type ApplyMode = 'deterministic' | 'judgment-needed'

/**
 * Classify a gap as deterministic or judgment-needed.
 * A gap is judgment-needed when its kind requires human review (JUDGMENT_KINDS)
 * OR when its applyVia commands contain `<placeholder>` tokens.
 */
export function classifyApplyVia(kind: GapKind, applyVia: string[]): ApplyMode {
  if (JUDGMENT_KINDS.has(kind)) return 'judgment-needed'
  if (!isDeterministic(applyVia)) return 'judgment-needed'
  return 'deterministic'
}

/** Extract the applyVia commands from all applied (deterministic) gaps — for dry-run display. */
export function formatDryRunCommands(result: ApplyGapsResult): string[] {
  return result.applied.flatMap((gap) => gap.enrichment.applyVia)
}

/**
 * Apply (or dry-run) all deterministic gaps.
 * Judgment-needed gaps (containing `<placeholder>`) are always skipped.
 */
export function applyGaps(gaps: Gap[], opts: ApplyGapsOptions): ApplyGapsResult {
  const applied: Gap[] = []
  const skipped: SkippedGap[] = []

  for (const gap of gaps) {
    const cmds = gap.enrichment.applyVia
    if (JUDGMENT_KINDS.has(gap.kind) || !isDeterministic(cmds)) {
      skipped.push({ gap, reason: 'needs-judgment' })
      continue
    }
    if (!opts.dryRun) {
      for (const cmd of cmds) opts.execute(cmd)
    }
    applied.push(gap)
  }

  return { applied, skipped }
}
