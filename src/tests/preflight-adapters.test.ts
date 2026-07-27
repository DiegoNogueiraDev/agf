/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_b2c4b7e06b91 — realGitProbe's execGit used execSync with a shell
 * string (`git ${args.join(' ')}`). The one call site carrying untrusted
 * input (topic, from `agf preflight "<topic>"`) was shell-quoted via
 * quoteArg(), but that quoting is POSIX-specific — it silently does not hold
 * on Windows (cmd.exe has different metacharacters), a platform agf ships
 * binaries for. Fix: execFileSync('git', args, ...) — no shell is ever
 * invoked, so there is nothing to quote or escape, on any platform.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { realGitProbe } from '../core/preflight/preflight-adapters.js'

function initRepo(dir: string): void {
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir })
  execFileSync('git', ['commit', '--allow-empty', '-q', '-m', 'initial commit about widgets'], { cwd: dir })
}

describe('node_b2c4b7e06b91: realGitProbe.commitsMatching never invokes a shell', () => {
  let dir: string
  const markerFile = join(tmpdir(), 'agf-preflight-injection-marker')

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-preflight-adapters-'))
    initRepo(dir)
    rmSync(markerFile, { force: true })
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    rmSync(markerFile, { force: true })
  })

  it('a topic containing shell metacharacters is treated as a literal grep pattern, never executed', () => {
    const maliciousTopic = `widgets'; touch ${markerFile}; echo '`
    const result = realGitProbe.commitsMatching(maliciousTopic, dir)

    expect(existsSync(markerFile)).toBe(false)
    expect(result).toEqual([])
  })

  it('a normal topic still finds a matching commit message', () => {
    const result = realGitProbe.commitsMatching('widgets', dir)
    expect(result.length).toBeGreaterThan(0)
  })

  it('branch() returns the real current branch name', () => {
    const branch = realGitProbe.branch(dir)
    expect(typeof branch).toBe('string')
  })
})
