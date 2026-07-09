/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_b750d797090f — sync-skills.mjs canonical sync
 *
 * AC1: Script mirrors .agents/skills/ to repo/skills/ and ~/.claude/skills/
 * AC2: Supports --dry-run (no writes)
 * AC3: Idempotent (unchanged files not rewritten)
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
  let repoDir: string
  let globalDir: string

  beforeEach(() => {
    tmpBase = mkdtempSync(join(tmpdir(), 'sync-skills-test-'))
    agentDir = join(tmpBase, '.agents', 'skills')
    repoDir = join(tmpBase, 'skills')
    globalDir = join(tmpBase, '.claude', 'skills')
    makeFakeSkillsDir(agentDir, 'test-skill', '# Test Skill\nContent here.')
  })

  it('copies SKILL.md to repo/skills/<name>/', () => {
    const result = runSync([], { AGF_AGENTS_SKILLS: agentDir, AGF_REPO_SKILLS: repoDir, AGF_GLOBAL_SKILLS: globalDir })
    expect(result.status).toBe(0)
    expect(existsSync(join(repoDir, 'test-skill', 'SKILL.md'))).toBe(true)
    expect(readFileSync(join(repoDir, 'test-skill', 'SKILL.md'), 'utf8')).toContain('Test Skill')
  })

  it('copies SKILL.md to global skills dir', () => {
    runSync([], { AGF_AGENTS_SKILLS: agentDir, AGF_REPO_SKILLS: repoDir, AGF_GLOBAL_SKILLS: globalDir })
    expect(existsSync(join(globalDir, 'test-skill', 'SKILL.md'))).toBe(true)
  })

  afterEach(() => {
    rmSync(tmpBase, { recursive: true, force: true })
  })
})

describe('sync-skills (AC2 — --dry-run writes nothing)', () => {
  let tmpBase: string
  let agentDir: string
  let repoDir: string
  let globalDir: string

  beforeEach(() => {
    tmpBase = mkdtempSync(join(tmpdir(), 'sync-skills-dry-'))
    agentDir = join(tmpBase, '.agents', 'skills')
    repoDir = join(tmpBase, 'skills')
    globalDir = join(tmpBase, '.claude', 'skills')
    makeFakeSkillsDir(agentDir, 'dry-skill', '# Dry Skill')
  })

  it('does not write files in dry-run mode', () => {
    const result = runSync(['--dry-run'], {
      AGF_AGENTS_SKILLS: agentDir,
      AGF_REPO_SKILLS: repoDir,
      AGF_GLOBAL_SKILLS: globalDir,
    })
    expect(result.status).toBe(0)
    expect(existsSync(join(repoDir, 'dry-skill', 'SKILL.md'))).toBe(false)
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
  let repoDir: string
  let globalDir: string

  beforeEach(() => {
    tmpBase = mkdtempSync(join(tmpdir(), 'sync-skills-idem-'))
    agentDir = join(tmpBase, '.agents', 'skills')
    repoDir = join(tmpBase, 'skills')
    globalDir = join(tmpBase, '.claude', 'skills')
    makeFakeSkillsDir(agentDir, 'idem-skill', '# Idem Skill')
  })

  it('reports unchanged on second run', () => {
    const env = { AGF_AGENTS_SKILLS: agentDir, AGF_REPO_SKILLS: repoDir, AGF_GLOBAL_SKILLS: globalDir }
    runSync([], env) // first run
    const result = runSync([], env) // second run
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('unchanged')
  })

  afterEach(() => {
    rmSync(tmpBase, { recursive: true, force: true })
  })
})
