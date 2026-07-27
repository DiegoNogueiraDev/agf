/**
 * skill-destination.test.ts — where `agf skill install` writes, per CLI.
 *
 * The promise of the epic is "any person, any CLI". That only holds if the install
 * lands in a directory the user's own CLI actually reads — and, symmetrically, one
 * that agf's own `skill list` can see. These tests pin that pair of invariants and
 * refuse the two silent failures: writing somewhere nothing reads, and guessing a
 * destination when we do not know which CLI is driving.
 */
import { describe, it, expect } from 'vitest'
import { AgentSourceSchema } from '../core/hooks/config-loader.js'
import { defaultSkillRoots, resolveSkillsDestination } from '../core/skills/skill-registry.js'

const ROOT = '/proj'

describe('resolveSkillsDestination', () => {
  it('resolves a non-empty destination for every CLI agf claims to support', () => {
    const supported = AgentSourceSchema.options.filter((c) => c !== 'unknown')
    for (const cli of supported) {
      const r = resolveSkillsDestination(cli, ROOT)
      expect(r.ok, `no destination mapped for ${cli}`).toBe(true)
      if (r.ok) expect(r.dir.length).toBeGreaterThan(0)
    }
  })

  it('only ever writes where skill list already reads', () => {
    // The invariant that makes an install observable. A destination outside the
    // read roots installs into the void: the file exists, nothing lists it.
    const roots = defaultSkillRoots(ROOT)
    for (const cli of AgentSourceSchema.options.filter((c) => c !== 'unknown')) {
      const r = resolveSkillsDestination(cli, ROOT)
      if (!r.ok) throw new Error(`unmapped: ${cli}`)
      expect(roots, `${cli} writes outside the read roots`).toContain(r.dir)
    }
  })

  it('gives Claude its own native skills directory', () => {
    const r = resolveSkillsDestination('claude', ROOT)
    if (!r.ok) throw new Error('expected ok')
    expect(r.dir).toBe(`${ROOT}/.claude/skills`)
  })

  it('puts AGENTS.md-driven CLIs in the agnostic base they already read', () => {
    for (const cli of ['codex', 'opencode'] as const) {
      const r = resolveSkillsDestination(cli, ROOT)
      if (!r.ok) throw new Error('expected ok')
      expect(r.dir).toBe(`${ROOT}/.agents/skills`)
    }
  })

  it('REFUSES to guess when the driving CLI is unknown', () => {
    // Silently defaulting is the failure mode: the user believes the skill was
    // installed for their CLI, and it landed somewhere that CLI never reads.
    const r = resolveSkillsDestination('unknown', ROOT)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.code).toBe('CLI_UNKNOWN')
  })
})
