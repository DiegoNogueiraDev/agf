/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { buildImportDiff } from '../cli/commands/import-cmd.js'

const PRD_V1 = `# Visão\n\n## Requisitos\nreq a\n\n## Riscos\nrisco a\n`
const PRD_V2 = `# Visão\n\n## Requisitos\nreq a CHANGED\n\n## Riscos\nrisco a\n`

describe('buildImportDiff (agf import-prd --diff — T4.1)', () => {
  // AC: GIVEN an identical PRD WHEN --diff runs THEN all sections appear as unchanged
  it('reports all sections unchanged for identical content', () => {
    const d = buildImportDiff(PRD_V1, PRD_V1)
    expect(d.addedCount).toBe(0)
    expect(d.removedCount).toBe(0)
    expect(d.modifiedCount).toBe(0)
    expect(d.unchangedCount).toBeGreaterThan(0)
  })

  // AC: GIVEN a changed PRD WHEN --diff runs THEN the envelope lists added/removed/modified counts
  it('reports a modified section when content changed', () => {
    const d = buildImportDiff(PRD_V1, PRD_V2)
    expect(d.modifiedCount).toBeGreaterThanOrEqual(1)
    expect(d).toHaveProperty('addedCount')
    expect(d).toHaveProperty('removedCount')
  })

  it('treats everything as added when there is no prior import', () => {
    const d = buildImportDiff(null, PRD_V1)
    expect(d.addedCount).toBeGreaterThan(0)
    expect(d.removedCount).toBe(0)
  })
})
