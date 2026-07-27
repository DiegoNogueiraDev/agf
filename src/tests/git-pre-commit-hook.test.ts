/*!
 * Task node_8157af6ec384 — agf init installs git pre-commit hook.
 *
 * AC1: agf init → .git/hooks/pre-commit exists running 'agf lint-files --staged'; idempotent.
 * AC2: Existing pre-commit hook is preserved (appended, not overwritten).
 * AC3: fail-open when agf not in PATH (warns but allows commit).
 */

import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { installPreCommitHook } from '../core/git/pre-commit-hook.js'

function makeGitDir(): { dir: string; hooksDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'agf-hook-'))
  const hooksDir = join(dir, '.git', 'hooks')
  mkdirSync(hooksDir, { recursive: true })
  return { dir, hooksDir }
}

describe('installPreCommitHook', () => {
  it('creates pre-commit hook running agf lint-files --staged (AC1)', () => {
    const { dir, hooksDir } = makeGitDir()
    try {
      installPreCommitHook(dir)
      const hookPath = join(hooksDir, 'pre-commit')
      expect(existsSync(hookPath)).toBe(true)
      const content = readFileSync(hookPath, 'utf-8')
      expect(content).toContain('agf lint-files --staged')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('is idempotent — re-running does not duplicate the hook block (AC1)', () => {
    const { dir, hooksDir } = makeGitDir()
    try {
      installPreCommitHook(dir)
      installPreCommitHook(dir)
      const content = readFileSync(join(hooksDir, 'pre-commit'), 'utf-8')
      const matches = content.match(/agf lint-files --staged/g) ?? []
      expect(matches.length).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('appends to an existing pre-commit hook without overwriting it (AC2)', () => {
    const { dir, hooksDir } = makeGitDir()
    try {
      const hookPath = join(hooksDir, 'pre-commit')
      writeFileSync(hookPath, '#!/bin/sh\necho "existing"\n', 'utf-8')
      installPreCommitHook(dir)
      const content = readFileSync(hookPath, 'utf-8')
      expect(content).toContain('existing')
      expect(content).toContain('agf lint-files --staged')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('hook script contains fail-open guard for when agf is not in PATH (AC3)', () => {
    const { dir, hooksDir } = makeGitDir()
    try {
      installPreCommitHook(dir)
      const content = readFileSync(join(hooksDir, 'pre-commit'), 'utf-8')
      // Must have a PATH check that exits 0 (fail-open) when agf missing
      expect(content).toMatch(/command -v agf|which agf/)
      expect(content).toMatch(/exit 0/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
