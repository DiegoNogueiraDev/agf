/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_55da27d96539 — scope_creep detector + BLAST_RADIUS_EXCEEDED gate.
 * "done com escopo vazado" was only avoided because the agent remembered to
 * check. detectScopeCreep is the pure leg (modifiedFiles \ (declared ∪
 * allowlist)) — mirrors detect-phantom-done.ts's shape (missingFiles).
 */

import { describe, it, expect } from 'vitest'
import { detectScopeCreep, DEFAULT_SCOPE_ALLOWLIST } from '../core/gaps/detect-scope-creep.js'

describe('detectScopeCreep', () => {
  it('flags a modified file not in declared or the allowlist', () => {
    const undeclared = detectScopeCreep(['src/a.ts', 'src/b.ts'], ['src/a.ts'])
    expect(undeclared).toEqual(['src/b.ts'])
  })

  it('passes when every modified file is declared (no regression vs current behavior)', () => {
    const undeclared = detectScopeCreep(['src/a.ts'], ['src/a.ts'])
    expect(undeclared).toEqual([])
  })

  it('does not flag an allowlisted file (e.g. dist/x.js)', () => {
    const undeclared = detectScopeCreep(['src/a.ts', 'dist/x.js'], ['src/a.ts'])
    expect(undeclared).toEqual([])
  })

  it('does not flag a package-lock.json change', () => {
    const undeclared = detectScopeCreep(['src/a.ts', 'package-lock.json'], ['src/a.ts'])
    expect(undeclared).toEqual([])
  })

  it('DEFAULT_SCOPE_ALLOWLIST includes the declarative whitelist plus dist/build/lock patterns', () => {
    expect(DEFAULT_SCOPE_ALLOWLIST).toEqual(
      expect.arrayContaining(['**/*.d.ts', '**/index.ts', 'dist/**', 'build/**', '**/*.lock', 'package-lock.json']),
    )
  })
})
