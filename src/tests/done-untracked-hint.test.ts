/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_e7936f2862ae — agf done auto-stage untracked declared files.
 * The bug: NO_FILES_MODIFIED fires even when --implementation-files/
 * --test-files are correctly declared, because the declared files are
 * untracked (never git add'd). autoStageDeclaredFiles attempts `git add` on
 * any declared file that shows up as untracked in `git status --porcelain`,
 * so a legitimately-declared-but-unstaged file doesn't trip the gate.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { autoStageDeclaredFiles } from '../core/git/auto-stage-declared-files.js'

function initRepo(dir: string): void {
  execSync('git init -q', { cwd: dir })
  execSync('git config user.email "test@test.com"', { cwd: dir })
  execSync('git config user.name "Test"', { cwd: dir })
  writeFileSync(join(dir, 'README.md'), '# test\n')
  execSync('git add README.md', { cwd: dir })
  execSync('git commit -q -m init', { cwd: dir })
}

describe('autoStageDeclaredFiles', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-autostage-'))
    initRepo(dir)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('GIVEN a declared file that exists but is untracked THEN git add stages it successfully', () => {
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src/new.ts'), '// new\n')

    const result = autoStageDeclaredFiles(dir, ['src/new.ts'])

    expect(result.staged).toEqual(['src/new.ts'])
    expect(result.failed).toEqual([])

    const status = execSync('git status --porcelain', { cwd: dir, encoding: 'utf-8' })
    expect(status).toContain('A  src/new.ts')
  })

  it('GIVEN a declared file that is gitignored THEN git add fails and it is reported', () => {
    writeFileSync(join(dir, '.gitignore'), 'ignored.ts\n')
    writeFileSync(join(dir, 'ignored.ts'), '// ignored\n')

    const result = autoStageDeclaredFiles(dir, ['ignored.ts'])

    expect(result.staged).toEqual([])
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].file).toBe('ignored.ts')
  })

  it('GIVEN a declared file that is already tracked and modified THEN it is left alone (no-op, no regression)', () => {
    writeFileSync(join(dir, 'README.md'), '# modified\n')

    const result = autoStageDeclaredFiles(dir, ['README.md'])

    expect(result.staged).toEqual([])
    expect(result.failed).toEqual([])

    const status = execSync('git status --porcelain', { cwd: dir, encoding: 'utf-8' })
    expect(status).toContain(' M README.md') // still unstaged, untouched
  })
})
