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

import { createHash } from 'node:crypto'
import { MARKER_START, MARKER_END } from './ai-memory-generator.js'

/**
 * Why the on-disk region stopped matching canonical.
 *
 * `outdated`  — consistent with a body written by an OLDER generator: every line on
 *               disk still appears in canonical, in order, so reaching canonical only
 *               required ADDING content. This is what every already-initialized
 *               project looks like right after the generator grows a section.
 * `hand_edited` — the region contains a line canonical never had: someone typed it.
 *
 * `indeterminate` — an UNSTAMPED body whose difference cannot be explained by
 *               additions alone. Without provenance this is genuinely unknowable,
 *               and it is where the old heuristic used to cry tampering.
 *
 * Files the generator stamps are classified exactly. For legacy files the only
 * sound inference is kept (all-lines-survive ⇒ additions only ⇒ older body) and
 * everything else reports honestly rather than guessing: a false accusation of
 * tampering trains users to ignore the detector, which costs more than a shrug.
 * A pure DELETION in an unstamped file still reads as `outdated` — it leaves a
 * subsequence — which is why stamping, not a cleverer rule, is the real fix.
 */
export type DriftCause = 'outdated' | 'hand_edited' | 'indeterminate'

/** Provenance line the generator writes as the first line inside the markers. */
const STAMP_PREFIX = '<!-- agent-graph-flow:sha256 '
const STAMP_SUFFIX = ' -->'

/** sha256 of the body text, over content — comparable by a later, different process. */
function hashBody(body: string): string {
  return createHash('sha256').update(body.trim(), 'utf8').digest('hex')
}

/**
 * Prefix `body` with the provenance stamp the drift detector reads back.
 *
 * WHY stamp instead of inferring: a body the generator produced and a body a human
 * edited leave IDENTICAL evidence once the canonical output has changed in both
 * directions — the subsequence heuristic could only ever recognise growth. Recording
 * the hash at write time turns "we generated this" from an inference into a fact,
 * so a shrunk canonical no longer reads as tampering.
 */
export function stampBody(body: string): string {
  return `${STAMP_PREFIX}${hashBody(body)}${STAMP_SUFFIX}\n${body.trim()}`
}

/** Split a region into its stamp (if any) and the body the stamp covers. */
function splitStamp(region: string): { stamp: string | null; body: string } {
  const [first, ...rest] = region.split('\n')
  if (!first.startsWith(STAMP_PREFIX) || !first.trimEnd().endsWith(STAMP_SUFFIX)) {
    return { stamp: null, body: region }
  }
  return { stamp: first.trimEnd().slice(STAMP_PREFIX.length, -STAMP_SUFFIX.length).trim(), body: rest.join('\n') }
}

export interface DriftFinding {
  type: 'boundary_drift'
  /** Why the region differs — see {@link DriftCause}. */
  cause: DriftCause
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
  const region = fileContent.slice(regionStart, endIdx).trim()
  const { stamp, body } = splitStamp(region)
  const actual = body.trim()
  const expected = canonical.trim()

  if (actual === expected) return []

  return [{ type: 'boundary_drift', cause: classifyCause(actual, expected, stamp), actual, expected }]
}

/**
 * `outdated` when `actual`'s lines are an order-preserving subsequence of
 * `expected`'s — i.e. canonical could be reached by additions alone.
 */
function classifyCause(actual: string, expected: string, stamp: string | null): DriftCause {
  // Stamped: settled by fact. The body either still hashes to what we wrote — so it
  // is simply an older generation — or it does not, and someone typed in it.
  if (stamp) return hashBody(actual) === stamp ? 'outdated' : 'hand_edited'

  // Unstamped (written before provenance existed). One inference is still SOUND:
  // if every line on disk survives in canonical, reaching canonical needed only
  // additions, which no hand edit produces. Anything else — notably content the
  // generator later REMOVED — is genuinely unknowable from the bytes, and that is
  // the case that used to be reported as tampering. Say we cannot tell instead.
  return isSubsequence(actual.split('\n'), expected.split('\n')) ? 'outdated' : 'indeterminate'
}

/** True when every line of `needle` appears in `haystack`, in order. */
function isSubsequence(needle: readonly string[], haystack: readonly string[]): boolean {
  let cursor = 0
  for (const line of needle) {
    cursor = haystack.indexOf(line, cursor)
    if (cursor === -1) return false
    cursor += 1
  }
  return true
}
