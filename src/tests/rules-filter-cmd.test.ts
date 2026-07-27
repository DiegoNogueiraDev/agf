/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { runRulesFilter } from '../cli/commands/rules-filter-cmd.js'
import type { RulePack } from '../core/config/language-rules-filter.js'

const PACKS: RulePack[] = [
  { id: 'typescript', languages: ['typescript'], content: 'TS rules' },
  { id: 'golang', languages: ['go'], content: 'Go rules' },
  { id: 'common', languages: [], content: 'Common rules' },
]

describe('runRulesFilter — CLI surface for core/config/language-rules-filter.ts (WIRE)', () => {
  // AC: GIVEN a Go stack WHEN filtered THEN golang + common packs are returned, typescript is not
  it('filters packs to the active language stack, always keeping language-agnostic packs', () => {
    const result = runRulesFilter({ activeLanguages: ['go'], packs: PACKS })
    const ids = result.map((p) => p.id)
    expect(ids).toEqual(['golang', 'common'])
  })

  // AC: GIVEN no active languages WHEN filtered THEN only language-agnostic packs remain
  it('returns only common packs when no language matches', () => {
    const result = runRulesFilter({ activeLanguages: [], packs: PACKS })
    expect(result.map((p) => p.id)).toEqual(['common'])
  })
})
