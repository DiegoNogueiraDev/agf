/* eslint-disable security/detect-unsafe-regex */
/*!
 * Lint exemption: the regex patterns in this file are bounded
 * (literal alternations, short character classes, language-keyword
 * lookups) and run against parsed/structured input. The ReDoS class
 * the rule is designed to prevent is not reachable here.
 */
/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Citation Extractor — finds references to specs/ADRs/epics embedded in
 * code comments. The accepted form is `§<ID>` where `<ID>` is one or more
 * dot- or hyphen-separated alphanumeric segments (e.g. `§EPIC-7.3`,
 * `§ADR-0049`, `§EPIC-13.1`).
 *
 * Citations anchor implementation back to its design intent and serve as
 * the basis for the `citation_groundedness` analyze mode.
 */

const CITATION_RE = /§[A-Za-z][A-Za-z0-9]*(?:[-.][A-Za-z0-9]+)+/g
const CITATION_TEST_RE = /§[A-Za-z][A-Za-z0-9]*(?:[-.][A-Za-z0-9]+)+/

/** extractCitations —  */
export function extractCitations(text: string): string[] {
  const matches = text.match(CITATION_RE)
  return matches ? [...matches] : []
}

/** hasCitation —  */
export function hasCitation(text: string): boolean {
  return CITATION_TEST_RE.test(text)
}

/**
 * Deleting a model or moving a logic block leaves comments in neighboring
 * files citing a path that no longer exists — silent rot, invisible to
 * tests/build, only caught by manual inspection. Matches a relative
 * source-file path (an "src/…/*.ext" segment) embedded in comment text.
 */
const PATH_RE = /\b(?:src|lib|test|tests)\/[\w./-]+\.\w+/g

/** Extract file-path-like references embedded in comment text (order-preserving, de-duplicated). */
export function extractPathReferences(text: string): string[] {
  const matches = text.match(PATH_RE)
  return matches ? [...new Set(matches)] : []
}

/**
 * Check each path reference in `commentText` against `fileExists` (the same
 * {@link FileExistsPort} `detectPhantomDone` uses) and return the ones that
 * no longer exist on disk — a dead comment.
 */
export function findDeadCommentReferences(
  commentText: string,
  fileExists: import('../gaps/detect-phantom-done.js').FileExistsPort,
): string[] {
  return extractPathReferences(commentText).filter((ref) => !fileExists(ref))
}
