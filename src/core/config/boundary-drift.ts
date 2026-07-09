/*!
 * boundary-drift.ts — read-only detector for hand-edits in marker-wrapped regions.
 *
 * Compares the content inside <!-- agent-graph-flow:start/end --> markers in a file
 * against the canonical generator output. A mismatch means the region was hand-edited
 * (boundary drift) and surfaces a DriftFinding. Never modifies files.
 *
 * Why: CLAUDE.md / AGENTS.md sections are generated — hand-edits drift silently and
 * get overwritten on the next `agf init`. This detector makes the drift visible before
 * it causes confusion.
 */

import { MARKER_START, MARKER_END } from './ai-memory-generator.js'

export interface DriftFinding {
  type: 'boundary_drift'
  /** Actual content found inside the markers. */
  actual: string
  /** Expected canonical content. */
  expected: string
}

/**
 * Detect boundary drift in a file's marker-wrapped region.
 * Returns an empty array when the region matches canonical or when no markers exist.
 */
export function detectBoundaryDrift(fileContent: string, canonical: string): DriftFinding[] {
  const startIdx = fileContent.indexOf(MARKER_START)
  const endIdx = fileContent.indexOf(MARKER_END)

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return []

  const regionStart = startIdx + MARKER_START.length
  const actual = fileContent.slice(regionStart, endIdx).trim()
  const expected = canonical.trim()

  if (actual === expected) return []

  return [{ type: 'boundary_drift', actual, expected }]
}
