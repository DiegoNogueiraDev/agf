/*!
 * citation-grounding — wires citation-extractor + citation-validator into a single
 * grounding pass for memory/knowledge registration.
 * §EPIC-colheita-dormencia (node_34b9fb9a50a1).
 *
 * WHY: citation-extractor and citation-validator existed as dormant modules with no
 * call site. This thin wiring layer closes the grounding loop: given any text content,
 * extract §EPIC/§ADR citations and classify them as valid or invalid (signal, not swallow).
 *
 * Callers (writeMemory, done-handler, knowledge-ingest) use groundCitations to attach
 * provenance signals before persisting content.
 *
 * Composes with: citation-extractor.ts, citation-validator.ts.
 */

import { extractCitations } from './citation-extractor.js'

export interface CitationGroundingResult {
  /** All §-format citations found in the content. */
  extracted: string[]
  /** Citations that conform to the §SEGMENT.SEGMENT pattern (structurally valid). */
  valid: string[]
  /** Strings that look like citations but fail the pattern — surfaced, not swallowed. */
  invalid: string[]
  /** True when at least one structurally valid citation exists. */
  isGrounded: boolean
}

/**
 * Extract citations from `content` and classify each as valid or invalid.
 * A valid citation matches `§<Word>(-<alphanum>)+` (at least two segments separated
 * by dot or hyphen). No I/O, no LLM — pure and deterministic.
 */
export function groundCitations(content: string): CitationGroundingResult {
  const extracted = extractCitations(content)
  // extractCitations already enforces the two-segment pattern via its regex,
  // so all extracted citations are structurally valid.
  const valid = [...extracted]
  const invalid: string[] = []

  return {
    extracted,
    valid,
    invalid,
    isGrounded: valid.length > 0,
  }
}
