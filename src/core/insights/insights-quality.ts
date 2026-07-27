/*!
 * insights-quality — burndown view of gap counts per kind + delta vs previous snapshot.
 * Task node_1704a7c53ac6.
 *
 * WHY: `agf insights quality` gives a deterministic, token-free quality burndown:
 * which gap kinds are growing vs shrinking, derived from the completeness-events
 * snapshot store. Pure function — reads from GapsSnapshot[], zero DB calls.
 *
 * Composes with: completeness-events.ts (GapsSnapshot, getGapsHistory),
 *                insights-cmd.ts (`agf insights quality` subcommand).
 */

import type { GapsSnapshot } from '../gaps/completeness-events.js'

export interface InsightsQualityResult {
  /** Latest snapshot's byKind counts. */
  kinds: Record<string, number>
  /** Δ per kind: latest minus previous snapshot. Empty when <2 snapshots. */
  delta: Record<string, number>
  snapshotCount: number
  latestTimestamp: string | null
}

/** Compute gap-kind burndown from an ordered list of snapshots (oldest→newest). */
export function computeInsightsQuality(snaps: GapsSnapshot[]): InsightsQualityResult {
  if (snaps.length === 0) {
    return { kinds: {}, delta: {}, snapshotCount: 0, latestTimestamp: null }
  }

  const latest = snaps[snaps.length - 1]
  const kinds = { ...latest.byKind }

  if (snaps.length < 2) {
    return { kinds, delta: {}, snapshotCount: 1, latestTimestamp: latest.timestamp }
  }

  const prev = snaps[snaps.length - 2]
  const allKinds = new Set([...Object.keys(kinds), ...Object.keys(prev.byKind)])
  const delta: Record<string, number> = {}
  for (const k of allKinds) {
    const d = (kinds[k] ?? 0) - (prev.byKind[k] ?? 0)
    delta[k] = d
  }

  return { kinds, delta, snapshotCount: snaps.length, latestTimestamp: latest.timestamp }
}
