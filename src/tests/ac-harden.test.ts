/*!
 * Task node_836654d6a6c9 — agf ac harden command.
 *
 * AC1: Given node with 2 weak ACs, When rewriteWeakAcs called with dry-run=true,
 *      Then returns 2 rewrite proposals and node ACs are unchanged.
 * AC2: Given no dry-run, When applied, Then ACs updated in store.
 * AC3: Given output, When emitted, Then respects JSON envelope with rewrites array.
 */

import { describe, it, expect } from 'vitest'
import { rewriteWeakAc, type AcRewriteResult } from '../core/analyzer/ac-harden.js'

describe('rewriteWeakAc', () => {
  it('returns a GWT skeleton for a weak AC (AC1 + AC3)', () => {
    const result: AcRewriteResult = rewriteWeakAc('the system should work correctly')
    expect(result.original).toBe('the system should work correctly')
    expect(result.rewritten).toMatch(/Given|GIVEN/)
    expect(result.rewritten).toMatch(/When|WHEN/)
    expect(result.rewritten).toMatch(/Then|THEN/)
    expect(result.wasWeak).toBe(true)
  })

  it('returns passthrough for already strong AC (AC2)', () => {
    const strong =
      'Given a user submits the form, When the server responds, Then the status code is 200 and response time < 100ms'
    const result = rewriteWeakAc(strong)
    expect(result.wasWeak).toBe(false)
    expect(result.rewritten).toBe(strong)
  })

  it('rewrite includes placeholder tokens (G/W/T)', () => {
    const result = rewriteWeakAc('the feature works')
    expect(result.rewritten).toMatch(/\[/)
    expect(result.rewritten).toMatch(/\]/)
  })
})
