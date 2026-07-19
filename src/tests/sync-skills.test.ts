/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_b750d797090f — sync-skills.mjs canonical sync
 *
 * AC1: Script mirrors .agents/skills/ to ~/.claude/skills/
 * AC2: Supports --dry-run (no writes)
 * AC3: Idempotent (unchanged files not rewritten)
 *
 * There used to be a second destination, `skills/` at the repo root. Nothing read
 * it — skill-registry.ts never looked there — and it drifted: fourteen of its
 * skills had fallen dozens of lines behind the global registry. The AC that
 * required it is gone with it. A mirror nobody reads is where mistakes hide.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(__dirname, '../../scripts/sync-skills.mjs')

function makeFakeSkillsDir(base: string, skillName: string, content: string): void {
  const dir = join(base, skillName)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), content, 'utf8')
}

function runSync(
  args: string[],
  env: Record<string, string>,
): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync('node', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status }
}

describe('sync-skills (AC1 — mirrors to repo/skills and ~/.claude/skills)', () => {
  let tmpBase: string
  let agentDir: string
  let globalDir: string

  beforeEach(() => {
    tmpBase = mkdtempSync(join(tmpdir(), 'sync-skills-test-'))
    agentDir = join(tmpBase, '.agents', 'skills')
    globalDir = join(tmpBase, '.claude', 'skills')
    makeFakeSkillsDir(agentDir, 'test-skill', '# Test Skill\nContent here.')
  })

  it('copies SKILL.md to the global skills dir', () => {
    const result = runSync([], { AGF_AGENTS_SKILLS: agentDir, AGF_GLOBAL_SKILLS: globalDir })
    expect(result.status).toBe(0)
    expect(existsSync(join(globalDir, 'test-skill', 'SKILL.md'))).toBe(true)
    expect(readFileSync(join(globalDir, 'test-skill', 'SKILL.md'), 'utf8')).toContain('Test Skill')
  })

  it('writes to no other destination', () => {
    runSync([], { AGF_AGENTS_SKILLS: agentDir, AGF_GLOBAL_SKILLS: globalDir })
    expect(existsSync(join(tmpBase, 'skills')), 'the retired repo/skills mirror must not reappear').toBe(false)
  })

  afterEach(() => {
    rmSync(tmpBase, { recursive: true, force: true })
  })
})

describe('sync-skills (AC2 — --dry-run writes nothing)', () => {
  let tmpBase: string
  let agentDir: string
  let globalDir: string

  beforeEach(() => {
    tmpBase = mkdtempSync(join(tmpdir(), 'sync-skills-dry-'))
    agentDir = join(tmpBase, '.agents', 'skills')
    globalDir = join(tmpBase, '.claude', 'skills')
    makeFakeSkillsDir(agentDir, 'dry-skill', '# Dry Skill')
  })

  it('does not write files in dry-run mode', () => {
    const result = runSync(['--dry-run'], { AGF_AGENTS_SKILLS: agentDir, AGF_GLOBAL_SKILLS: globalDir })
    expect(result.status).toBe(0)
    expect(existsSync(join(globalDir, 'dry-skill', 'SKILL.md'))).toBe(false)
    expect(result.stdout).toContain('dry')
  })

  afterEach(() => {
    rmSync(tmpBase, { recursive: true, force: true })
  })
})

describe('sync-skills (AC3 — idempotent)', () => {
  let tmpBase: string
  let agentDir: string
  let globalDir: string

  beforeEach(() => {
    tmpBase = mkdtempSync(join(tmpdir(), 'sync-skills-idem-'))
    agentDir = join(tmpBase, '.agents', 'skills')
    globalDir = join(tmpBase, '.claude', 'skills')
    makeFakeSkillsDir(agentDir, 'idem-skill', '# Idem Skill')
  })

  it('reports unchanged on second run', () => {
    const env = { AGF_AGENTS_SKILLS: agentDir, AGF_GLOBAL_SKILLS: globalDir }
    runSync([], env) // first run
    const result = runSync([], env) // second run
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('unchanged')
  })

  // A skill is not just its SKILL.md. `graph-builder-leafcutter` keeps its pheromone and
  // capability tables under `references/`, and every one of the 31 skills points at the
  // shared spine `_shared.md`. Syncing only SKILL.md left both behind: the global registry
  // — the copy an agent actually reads — kept saying the harness had eight dimensions and
  // that ACO was the default, months after the code said otherwise. The mirror was honest
  // about the file it copied and silent about the two it did not.
  it('mirrors a skill reference file, not just SKILL.md', () => {
    mkdirSync(join(agentDir, 'idem-skill', 'references'), { recursive: true })
    writeFileSync(join(agentDir, 'idem-skill', 'references', 'notes.md'), 'reference body', 'utf8')

    const result = runSync([], { AGF_AGENTS_SKILLS: agentDir, AGF_GLOBAL_SKILLS: globalDir })
    expect(result.status).toBe(0)

    const mirrored = join(globalDir, 'idem-skill', 'references', 'notes.md')
    expect(existsSync(mirrored), 'references/ must reach the global registry').toBe(true)
    expect(readFileSync(mirrored, 'utf8')).toBe('reference body')
  })

  it('mirrors the shared root protocols every skill references', () => {
    writeFileSync(join(agentDir, '_shared.md'), 'the spine', 'utf8')
    writeFileSync(join(agentDir, '_rag-protocol.md'), 'token economy', 'utf8')

    const result = runSync([], { AGF_AGENTS_SKILLS: agentDir, AGF_GLOBAL_SKILLS: globalDir })
    expect(result.status).toBe(0)

    expect(readFileSync(join(globalDir, '_shared.md'), 'utf8')).toBe('the spine')
    expect(readFileSync(join(globalDir, '_rag-protocol.md'), 'utf8')).toBe('token economy')
  })

  it('leaves nothing behind: a second run of a full sync reports no change', () => {
    mkdirSync(join(agentDir, 'idem-skill', 'references'), { recursive: true })
    writeFileSync(join(agentDir, 'idem-skill', 'references', 'notes.md'), 'reference body', 'utf8')
    writeFileSync(join(agentDir, '_shared.md'), 'the spine', 'utf8')

    const env = { AGF_AGENTS_SKILLS: agentDir, AGF_GLOBAL_SKILLS: globalDir }
    runSync([], env)
    const second = runSync([], env)
    expect(second.stdout).toContain('unchanged')
    expect(second.stdout).not.toContain('UPDATE')
  })

  afterEach(() => {
    rmSync(tmpBase, { recursive: true, force: true })
  })
})
