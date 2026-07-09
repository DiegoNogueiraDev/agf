/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import type { DodCheck } from '../schemas/implementer-schema.js'
import { selectFailedAcForLesson } from '../core/autonomy/dod-lesson.js'

function check(name: string, passed: boolean, details = ''): DodCheck {
  return { name, passed, details, severity: 'required' }
}

describe('selectFailedAcForLesson', () => {
  it('returns the first AC when an AC-related check failed and the node has AC', () => {
    const dod = { checks: [check('has_testable_ac', false, 'no testable AC')] }
    const node = { acceptanceCriteria: ['GIVEN x WHEN y THEN z', 'other'] }
    expect(selectFailedAcForLesson(dod, node)).toBe('GIVEN x WHEN y THEN z')
  })

  it('falls back to the check details when the node has no AC text', () => {
    const dod = { checks: [check('ac_quality_pass', false, 'AC quality score: 40 (min 60)')] }
    expect(selectFailedAcForLesson(dod, {})).toBe('AC quality score: 40 (min 60)')
  })

  it('returns null when no AC-related check failed', () => {
    const dod = { checks: [check('has_testable_ac', true), check('no_unresolved_blockers', false)] }
    expect(selectFailedAcForLesson(dod, { acceptanceCriteria: ['a'] })).toBeNull()
  })

  it('returns null when there are no failed checks at all', () => {
    const dod = { checks: [check('has_acceptance_criteria', true)] }
    expect(selectFailedAcForLesson(dod, {})).toBeNull()
  })
})
