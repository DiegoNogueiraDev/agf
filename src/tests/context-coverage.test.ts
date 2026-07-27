/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Drift guard: every registered `agf` command must appear in the generated
 * per-CLI context body, and the context must stay 100% `agf` (zero `rtk`).
 * Fails CI when a command ships undocumented or the legacy `rtk` name reappears.
 */

import { describe, it, expect } from 'vitest'
import { listCommandNames } from '../core/config/command-surface.js'
import { generateCliContext, CLI_TARGETS } from '../core/spec-templates/agent-format.js'
import { CODEX_SKILL_SPECS } from '../core/config/codex-skill-specs.js'

describe('context coverage', () => {
  const names = listCommandNames()
  const body = generateCliContext('claude', 'demo', 'full')

  it('derives a non-trivial command list from the registry', () => {
    expect(names.length).toBeGreaterThan(40)
  })

  it('exposes command-discovery pointers instead of pinning the full catalog', () => {
    // The 260+ command catalog is foraged on demand (agf help / agf retrieve-command),
    // not pinned into every session's context — see the graph-context-economy skill.
    // Drift guard moves to `agf help`, which renders the same COMMAND_REGISTRY.
    expect(body).toContain('agf help')
    expect(body).toContain('agf retrieve-command')
  })

  it('keeps every CLI target context 100% agf — zero legacy `rtk` vocabulary', () => {
    // There used to be a carve-out here for the `agf rtk` alias. The alias was
    // named after a private sibling repo and has been removed, so the guard is
    // now unconditional: `rtk` must not appear anywhere in a generated context.
    for (const cli of CLI_TARGETS) {
      const body = generateCliContext(cli, 'demo', 'full')
      expect(/\brtk\b/i.test(body), `${cli} context must not mention rtk`).toBe(false)
    }
  })

  it('indexes every lifecycle skill in the generated context', () => {
    const skills = Object.keys(CODEX_SKILL_SPECS)
    const missing = skills.filter((name) => !body.includes(name))
    expect(missing, `skills missing from context: ${missing.join(', ')}`).toEqual([])
  })

  it('emits the skill index identically into every CLI target', () => {
    const heading = 'Índice de skills do ciclo'
    for (const cli of CLI_TARGETS) {
      const b = generateCliContext(cli, 'demo', 'full')
      expect(b.includes(heading), `${cli} context must include the skill index`).toBe(true)
    }
  })
})
