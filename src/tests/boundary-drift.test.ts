/**
 * boundary-drift.test.ts — boundary-drift detector for marker-wrapped regions.
 * ACs (from context + description):
 *  1. File whose marker region matches canonical → no findings.
 *  2. File whose marker region differs from canonical → finding with type 'boundary_drift'.
 *  3. File with no markers → no findings (nothing to compare).
 */
import { describe, it, expect } from 'vitest'
import { detectBoundaryDrift, stampBody, type DriftFinding } from '../core/config/boundary-drift.js'
import { MARKER_START, MARKER_END } from '../core/config/ai-memory-generator.js'

const canonical = 'canonical content here'

function wrap(content: string): string {
  return `preamble\n${MARKER_START}\n${content}\n${MARKER_END}\npostamble`
}

describe('detectBoundaryDrift', () => {
  it('returns no findings when marker region matches canonical', () => {
    const fileContent = wrap(canonical)
    const findings: DriftFinding[] = detectBoundaryDrift(fileContent, canonical)
    expect(findings).toHaveLength(0)
  })

  it('returns boundary_drift finding when region differs from canonical', () => {
    const fileContent = wrap('hand-edited content — different from canonical')
    const findings: DriftFinding[] = detectBoundaryDrift(fileContent, canonical)
    expect(findings).toHaveLength(1)
    expect(findings[0].type).toBe('boundary_drift')
  })

  it('returns no findings when file has no markers', () => {
    const fileContent = 'plain content with no markers at all'
    const findings: DriftFinding[] = detectBoundaryDrift(fileContent, canonical)
    expect(findings).toHaveLength(0)
  })
})

// ── Cause classification (node_91944b8b26a0) ──────────────────────────
//
// A mismatch has two very different causes and the old detector called both
// "hand-edited". When the generator's canonical body GROWS (a new section ships),
// every already-initialized project's file mismatches — through no fault of the
// user. Reporting that as tampering is a false alarm, and a false alarm teaches
// people to ignore the detector. Discriminator: an on-disk region that is an
// order-preserving SUBSEQUENCE of canonical was produced by an older generator
// (content was only added); a region containing a line canonical never had was
// touched by a human.

const OLD_BODY = ['# Header', '', 'section one', '', 'section two'].join('\n')
const NEW_BODY = ['# Header', '', 'section one', '', 'BRAND NEW SECTION', '', 'section two'].join('\n')

describe('detectBoundaryDrift — cause classification', () => {
  it('classifies an older generated body as outdated, not hand-edited', () => {
    const findings = detectBoundaryDrift(wrap(OLD_BODY), NEW_BODY)
    expect(findings).toHaveLength(1)
    expect(findings[0].cause).toBe('outdated')
  })

  it('reports an UNSTAMPED hand-edit as indeterminate — the bytes cannot prove it', () => {
    // This assertion used to demand 'hand_edited'. That was the heuristic guessing
    // and happening to be right on this fixture: an edited line and a line the
    // generator later removed are the same evidence. The honest answer without
    // provenance is "cannot tell" — and the stamped case below IS exact.
    const tampered = NEW_BODY.replace('section one', 'section one — I changed this by hand')
    const findings = detectBoundaryDrift(wrap(tampered), NEW_BODY)
    expect(findings).toHaveLength(1)
    expect(findings[0].cause).toBe('indeterminate')
  })

  it('the SAME edit is caught exactly once the body carries a stamp', () => {
    const tampered = stampBody(NEW_BODY).replace('section one', 'section one — I changed this by hand')
    expect(detectBoundaryDrift(wrap(tampered), NEW_BODY)[0].cause).toBe('hand_edited')
  })

  it('reports no drift once the outdated file is regenerated to canonical', () => {
    expect(detectBoundaryDrift(wrap(NEW_BODY), NEW_BODY)).toHaveLength(0)
  })

  it('reports a pure deletion as outdated — the documented limitation, pinned', () => {
    // HONEST LIMIT: removing a line also yields a subsequence, so a deletion is
    // indistinguishable from an older generated body without provenance. We choose
    // the conservative side deliberately: never accuse a user of tampering on
    // ambiguous evidence. Catching deletions needs a generation fingerprint stamped
    // at write time — tracked separately, not faked here.
    const deleted = NEW_BODY.split('\n')
      .filter((l) => l !== 'section two')
      .join('\n')
    expect(detectBoundaryDrift(wrap(deleted), NEW_BODY)[0].cause).toBe('outdated')
  })
})

// ── Provenance stamp (node_6d7130ede86e) ──────────────────────────────
//
// The subsequence heuristic could only recognise growth: when the generator
// REMOVED content (as it had, leaving 35 stale lines in this repo's own
// CLAUDE.md), an untouched generated body still read as tampering. Guessing
// from content was always the fallback; the real answer is to record what we
// wrote at the moment we write it — the same provenance the skill installer
// uses. With a stamp, "we generated this" is a fact, not an inference.

describe('detectBoundaryDrift — provenance stamp', () => {
  const OLD = ['# H', '', 'gone in the new version', '', 'kept'].join('\n')
  const NEW = ['# H', '', 'kept', '', 'added later'].join('\n')

  it('calls a stamped body outdated even when canonical REMOVED content', () => {
    // The case the heuristic could never get right: OLD has a line canonical no
    // longer contains, which is indistinguishable from a hand edit by content alone.
    const findings = detectBoundaryDrift(wrap(stampBody(OLD)), NEW)
    expect(findings).toHaveLength(1)
    expect(findings[0].cause).toBe('outdated')
  })

  it('calls a stamped body hand_edited once its content no longer matches the stamp', () => {
    const tampered = stampBody(NEW).replace('kept', 'kept — my note')
    expect(detectBoundaryDrift(wrap(tampered), NEW)[0].cause).toBe('hand_edited')
  })

  it('reports indeterminate for a legacy body carrying no stamp at all', () => {
    // Honest over confident: without provenance we cannot know, and saying so
    // beats accusing the user or excusing a real edit.
    const findings = detectBoundaryDrift(wrap('legacy body with no stamp'), NEW)
    expect(findings[0].cause).toBe('indeterminate')
  })

  it('ignores the stamp line itself when comparing against canonical', () => {
    expect(detectBoundaryDrift(wrap(stampBody(NEW)), NEW)).toHaveLength(0)
  })
})
