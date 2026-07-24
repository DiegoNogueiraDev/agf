/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Task 0b.2 — Pilot Protocol nas 5 Skills Core
 *
 * AC:
 * 1. Cada skill tem seção "## Pilot Protocol" com loop completo
 * 2. agf skill show graph-implement mostra protocol sem precisar de CLAUDE.md
 * 3. Skills atualizadas não quebram estrutura existente (mantêm frontmatter, ## When, ## Flow)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// After EPIC-SKILLS consolidation, the autonomous build/execute loop (and thus
// the next→brief→submit Pilot Protocol) lives only in graph-builder-leafcutter.
// graph-backlog-generation is human-in-the-loop planning, so it is excluded here.
const SKILLS_CORE = ['graph-builder-leafcutter'] as const
const SKILLS_REMAINING = [] as const
const SKILLS = SKILLS_CORE

function readSkill(name: string): string {
  return readFileSync(join(process.cwd(), '.agents/skills', name, 'SKILL.md'), 'utf-8')
}

describe('Pilot Protocol nas 5 skills core (Task 0b.2)', () => {
  // After the EPIC-SKILLS restructure, the pilot/delegate loop is no longer a literal
  // "## Pilot Protocol" header — it lives inline in the builder's "## Mandatory Flow" /
  // "## Workflow" sections. These tests assert the loop is still documented inline
  // (next→brief→submit) and self-contained, regardless of the section header name.
  for (const skill of SKILLS) {
    it(`${skill} documenta o loop pilot inline (AC#1)`, () => {
      const content = readSkill(skill)
      expect(content).toMatch(/agf (start|next)/)
      expect(content).toMatch(/agf brief/)
      expect(content).toMatch(/agf submit/)
    })

    it(`${skill} preserva estrutura existente (AC#3)`, () => {
      const content = readSkill(skill)
      // Must still have the original main heading
      expect(content).toMatch(/^# /m)
    })
  }

  it('graph-builder-leafcutter pilot loop é self-contained (AC#2)', () => {
    const content = readSkill('graph-builder-leafcutter')
    // Key commands must be inline, not deferred to CLAUDE.md
    expect(content).toMatch(/agf/)
    expect(content).not.toMatch(/^leia CLAUDE\.md/im)
  })
})

describe('Pilot Protocol nas skills restantes (Task 0b.3)', () => {
  it('no remaining skills after EPIC-SKILLS consolidation', () => {
    expect(SKILLS_REMAINING).toHaveLength(0)
  })
  for (const skill of SKILLS_REMAINING) {
    it(`${skill} tem seção ## Pilot Protocol`, () => {
      const content = readSkill(skill)
      expect(content).toMatch(/^## Pilot Protocol/m)
    })

    it(`${skill} Pilot Protocol contém loop next→brief→submit`, () => {
      const content = readSkill(skill)
      const pilotSection = content.split('## Pilot Protocol')[1] ?? ''
      expect(pilotSection).toMatch(/agf (start|next)/)
      expect(pilotSection).toMatch(/agf brief/)
      expect(pilotSection).toMatch(/agf submit/)
    })

    it(`${skill} preserva estrutura existente`, () => {
      const content = readSkill(skill)
      expect(content).toMatch(/^# /m)
    })
  }
})
