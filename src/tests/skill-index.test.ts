/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Drift guard: the generated skill index must cover 100% of the skill specs,
 * so any CLI sees the full lifecycle catalog and can pick the right approach.
 */

import { describe, it, expect } from 'vitest'
import { buildSkillIndex, CODEX_SKILL_SPECS } from '../core/config/codex-skill-specs.js'

describe('buildSkillIndex', () => {
  const body = buildSkillIndex()

  it('covers every codex skill spec (incl. graph-builder-leafcutter)', () => {
    const missing = Object.keys(CODEX_SKILL_SPECS).filter((name) => !body.includes(name))
    expect(missing, `skills missing from the index: ${missing.join(', ')}`).toEqual([])
    expect(body).toContain('graph-builder-leafcutter')
  })

  it('renders the selection table with Fase + entry-command columns', () => {
    expect(body).toContain('| Skill | Fase | Quando usar | Comando de entrada |')
    // every spec contributes its phase and a row
    for (const [name, spec] of Object.entries(CODEX_SKILL_SPECS)) {
      expect(body, `${name} row`).toContain(`\`${name}\``)
      expect(body).toContain(spec.phase)
    }
    // row count == spec count (+ header/separator/intro lines)
    const rows = body.split('\n').filter((l) => l.startsWith('| `graph-'))
    expect(rows).toHaveLength(Object.keys(CODEX_SKILL_SPECS).length)
  })

  it('escapes pipe characters so the markdown table stays intact', () => {
    // e.g. graph-analyze entry "agf node add --type requirement|constraint|risk"
    expect(body).not.toMatch(/\| `agf[^`]*\|[^`]*` \|/) // no unescaped pipe inside a code cell
  })

  it('is deterministic', () => {
    expect(buildSkillIndex()).toBe(body)
  })
})
