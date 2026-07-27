/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_570f9e37416d — detect dead comments referencing deleted/moved
 * code. Every time a model was deleted or logic moved, comments in
 * neighboring files still cited the deleted path — silent rot, only caught
 * by manual inspection. Violates CLAUDE.md rule 6 (a lying comment is worse
 * than none). extractPathReferences (citation-extractor.ts — extended, not
 * recreated: same "extract references from comments" domain as
 * extractCitations, different pattern) pulls file-path-like tokens out of
 * comment text; findDeadCommentReferences checks each against a DIP-injected
 * FileExistsPort (the same port detectPhantomDone already uses).
 */

import { describe, it, expect } from 'vitest'
import { extractPathReferences, findDeadCommentReferences } from '../core/citations/citation-extractor.js'
import type { FileExistsPort } from '../core/gaps/detect-phantom-done.js'

describe('extractPathReferences', () => {
  it('extracts a src/-relative file path reference from comment text', () => {
    expect(extractPathReferences('// see src/models/user.ts for the Mongoose model')).toEqual(['src/models/user.ts'])
  })

  it('returns [] for a comment with no path reference', () => {
    expect(extractPathReferences('// TODO: refactor later')).toEqual([])
  })

  it('extracts multiple distinct path references', () => {
    expect(extractPathReferences('// moved from src/old/a.ts to src/new/b.ts')).toEqual([
      'src/old/a.ts',
      'src/new/b.ts',
    ])
  })
})

describe('findDeadCommentReferences', () => {
  const existsOnly =
    (existing: Set<string>): FileExistsPort =>
    (p) =>
      existing.has(p)

  it("GIVEN a comment citing 'src/models/user.ts' which does NOT exist THEN it is reported as dead", () => {
    const fileExists = existsOnly(new Set())
    const result = findDeadCommentReferences('// see src/models/user.ts for Mongoose model', fileExists)
    expect(result).toEqual(['src/models/user.ts'])
  })

  it("GIVEN a comment citing 'src/models/user.ts' which EXISTS THEN NO dead reference is reported", () => {
    const fileExists = existsOnly(new Set(['src/models/user.ts']))
    const result = findDeadCommentReferences('// see src/models/user.ts', fileExists)
    expect(result).toEqual([])
  })

  it("GIVEN a comment with no path reference ('TODO: refactor later') THEN NO dead reference is reported", () => {
    const fileExists = existsOnly(new Set())
    const result = findDeadCommentReferences('// TODO: refactor later', fileExists)
    expect(result).toEqual([])
  })
})
