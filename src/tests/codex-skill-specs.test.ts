/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { CODEX_SKILL_SPECS } from '../core/config/codex-skill-specs.js'

/** Lifecycle skills with an explicit spec feeding the AGENTS.md/CLAUDE.md skill
 * index. Consolidated into 2 (EPIC-SKILLS): a planner + an autonomous builder. */
const DISTRIBUTED_SKILLS = ['graph-backlog-generation', 'graph-builder-leafcutter', 'graph-woodpecker'] as const

describe('codex-skill-specs (CLI-first specs feed the skill index)', () => {
  it('every lifecycle skill has an explicit spec (not the generic fallback)', () => {
    for (const name of DISTRIBUTED_SKILLS) {
      expect(CODEX_SKILL_SPECS[name], `missing spec for ${name}`).toBeDefined()
    }
  })

  it('every taught command is a real `agf` command (zero MCP verbs)', () => {
    for (const [name, spec] of Object.entries(CODEX_SKILL_SPECS)) {
      for (const [cmd] of spec.commands) {
        expect(cmd.startsWith('agf '), `${name} teaches non-agf command: ${cmd}`).toBe(true)
      }
    }
  })

  it('exposes phase + flow metadata for each spec (drives the index table)', () => {
    for (const [name, spec] of Object.entries(CODEX_SKILL_SPECS)) {
      expect(spec.phase, `${name} missing phase`).toBeTruthy()
      expect(spec.flow, `${name} missing flow`).toBeTruthy()
      expect(spec.when.length, `${name} missing when[]`).toBeGreaterThan(0)
    }
  })

  // node_2c8133df269b — the builder spec must teach the NO_TASKS harvest step so the
  // generated context (index/skill body) tells the agent backlog-empty triggers a
  // harvest, not a stop. Locks the source so the drift fixed here cannot reappear.
  it('graph-builder-leafcutter teaches the NO_TASKS harvest step', () => {
    const spec = CODEX_SKILL_SPECS['graph-builder-leafcutter']!
    const surface = `${spec.flow} ${spec.exit?.join(' ') ?? ''} ${spec.commands.map((c) => c.join(' ')).join(' ')}`
    expect(surface).toMatch(/harvest/i)
    // default-on trigger + opt-out (the deterministic "who fires it" — not opt-in)
    expect(surface).toContain('--no-harvest')
  })
})

/**
 * Zero-MCP guard over the src/skills/*.md atomic skills (the agf runtime + TUI
 * load these via skill-registry). Locks the drift fixed in WS-3 so MCP-era verbs
 * can't reappear teaching non-`agf` calls.
 */
describe('src/skills/*.md — zero MCP drift', () => {
  const SRC_SKILLS = join(process.cwd(), 'src', 'skills')
  const FORBIDDEN = [
    'analyze(mode',
    'node(action',
    'start_task',
    'finish_task',
    'update_status',
    'mcp__',
    'query_graph',
    'code_intelligence',
    'sync_stack_docs',
  ]
  const mdFiles = readdirSync(SRC_SKILLS, { recursive: true })
    .map((p) => String(p))
    .filter((p) => p.endsWith('.md'))

  it('finds the atomic skill markdown files', () => {
    expect(mdFiles.length).toBeGreaterThan(20)
  })

  it('no src/skills/*.md teaches an MCP-style verb (all CLI-first agf)', () => {
    const offenders: string[] = []
    for (const rel of mdFiles) {
      const body = readFileSync(join(SRC_SKILLS, rel), 'utf-8')
      for (const verb of FORBIDDEN) {
        if (body.includes(verb)) offenders.push(`${rel}: ${verb}`)
      }
    }
    expect(offenders, `MCP drift: ${offenders.join(', ')}`).toEqual([])
  })
})
