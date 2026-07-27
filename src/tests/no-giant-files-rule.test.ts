/*!
 * TDD: 'never giant files' rule in generated context-file sources (node_fdf57a23f634).
 *
 * AC1: AGF_GOLDEN_RULES mentions 'agf lint-files' and the 800-line ceiling.
 * AC2: AGF_GOLDEN_RULES includes the modularize advisory.
 */

import { describe, it, expect } from 'vitest'
import { AGF_GOLDEN_RULES } from '../core/config/cli-reference-content.js'

describe('AC1: AGF_GOLDEN_RULES references agf lint-files and 800-line ceiling', () => {
  it('references agf lint-files command', () => {
    expect(AGF_GOLDEN_RULES).toContain('agf lint-files')
  })

  it('references 800-line ceiling', () => {
    expect(AGF_GOLDEN_RULES).toMatch(/800/)
  })
})

describe('AC2: AGF_GOLDEN_RULES includes modularize advisory', () => {
  it('contains modularize instruction', () => {
    expect(AGF_GOLDEN_RULES).toMatch(/modulariz/i)
  })
})
