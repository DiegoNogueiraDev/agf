/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { runHashContent } from '../cli/commands/hash-content-cmd.js'

describe('runHashContent — CLI surface for canonicalization/ts.ts (WIRE)', () => {
  // AC: GIVEN file content WHEN hashed THEN a 64-char sha256 hex digest is returned
  it('returns a 64-char sha256 hex digest', () => {
    const result = runHashContent('const x = 1')
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  // AC: GIVEN two contents differing only in comments/whitespace WHEN hashed THEN same digest
  it('hashes trivial whitespace/comment variations identically', () => {
    const a = runHashContent('const x = 1 // comment\n\n\nconst y = 2')
    const b = runHashContent('const x = 1\nconst y = 2')
    expect(a.hash).toBe(b.hash)
  })

  // AC: GIVEN two semantically different contents WHEN hashed THEN different digest
  it('hashes semantically different content differently', () => {
    const a = runHashContent('const x = 1')
    const b = runHashContent('const x = 2')
    expect(a.hash).not.toBe(b.hash)
  })

  it('exposes the canonicalized form alongside the hash', () => {
    const result = runHashContent('const x = 1 // comment')
    expect(result.canonical).toBe('const x = 1')
  })
})
